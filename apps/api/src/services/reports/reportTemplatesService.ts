import { Prisma, PrismaClient, ReportTemplate } from '@prisma/client';
import type { ReportType } from './reportTypes';
import type { ListScope, Visibility } from '../../routes/reports/schemas';

// Rich error types for routes to map to HTTP status codes.
export class TemplateNotFoundError extends Error {
  readonly code = 'TEMPLATE_NOT_FOUND';
  constructor(id: string) {
    super(`Template ${id} not found`);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateForbiddenError extends Error {
  readonly code = 'TEMPLATE_FORBIDDEN';
  constructor(reason: string) {
    super(reason);
    this.name = 'TemplateForbiddenError';
  }
}

export class TemplateConflictError extends Error {
  readonly code = 'TEMPLATE_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'TemplateConflictError';
  }
}

// What the caller (route handler) tells us about the user invoking the action.
// `isAdmin` = caller has REPORTS_ADMIN permission.
export interface ViewerContext {
  id: string;
  isAdmin: boolean;
}

// Summary omits paramsJson — list pages don't need it.
export interface TemplateSummary {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  reportType: string;
  title: string;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}

export type TemplateDetail = TemplateSummary & { paramsJson: unknown };

export interface CreateTemplateInput {
  ownerId: string;
  reportType: ReportType;
  title: string;
  paramsJson: unknown;
  visibility: Visibility;
}

export interface UpdateTemplateInput {
  title?: string;
  paramsJson?: unknown;
  visibility?: Visibility;
}

// Shape Prisma returns when we include { owner: { select: { displayName } } }.
type RowWithOwner = ReportTemplate & { owner: { displayName: string } };

function toSummary(row: RowWithOwner): TemplateSummary {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerDisplayName: row.owner.displayName,
    reportType: row.reportType,
    title: row.title,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function toDetail(row: RowWithOwner): TemplateDetail {
  return { ...toSummary(row), paramsJson: row.paramsJson };
}

// Visibility check — can this viewer see this template? Enforced on every read path.
function canView(row: ReportTemplate, viewer: ViewerContext): boolean {
  if (viewer.isAdmin) return true;
  if (row.ownerId === viewer.id) return true;
  return row.visibility === 'shared';
}

export async function createTemplate(
  prisma: PrismaClient,
  input: CreateTemplateInput,
): Promise<TemplateDetail> {
  try {
    const row = await prisma.reportTemplate.create({
      data: {
        ownerId: input.ownerId,
        reportType: input.reportType,
        title: input.title,
        // Cast through Prisma.InputJsonValue — we accept any JSON-serializable object.
        paramsJson: input.paramsJson as Prisma.InputJsonValue,
        visibility: input.visibility,
      },
      include: { owner: { select: { displayName: true } } },
    });
    return toDetail(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new TemplateConflictError(
        `A template titled "${input.title}" already exists for this report type`,
      );
    }
    throw err;
  }
}

export async function listTemplates(
  prisma: PrismaClient,
  viewer: ViewerContext,
  args: { scope: ListScope; reportType?: ReportType },
): Promise<TemplateSummary[]> {
  // scope=mine: only caller's templates.
  // scope=all:  caller's templates + everyone else's visibility='shared'.
  // Admins with scope=all see everything.
  const where: Prisma.ReportTemplateWhereInput = {
    ...(args.reportType ? { reportType: args.reportType } : {}),
    ...(args.scope === 'mine'
      ? { ownerId: viewer.id }
      : viewer.isAdmin
        ? {}
        : { OR: [{ ownerId: viewer.id }, { visibility: 'shared' }] }),
  };
  const rows = await prisma.reportTemplate.findMany({
    where,
    include: { owner: { select: { displayName: true } } },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
  });
  return rows.map(toSummary);
}

export async function getTemplate(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
): Promise<TemplateDetail> {
  const row = await prisma.reportTemplate.findUnique({
    where: { id },
    include: { owner: { select: { displayName: true } } },
  });
  if (!row || !canView(row, viewer)) {
    // 404 for both "missing" and "hidden" so we don't leak existence.
    throw new TemplateNotFoundError(id);
  }
  return toDetail(row);
}

export async function updateTemplate(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
  patch: UpdateTemplateInput,
): Promise<TemplateDetail> {
  const existing = await prisma.reportTemplate.findUnique({ where: { id } });
  if (!existing || !canView(existing, viewer)) throw new TemplateNotFoundError(id);
  // Only the owner may modify. Admins don't get to silently rewrite someone
  // else's saved params.
  if (existing.ownerId !== viewer.id) {
    throw new TemplateForbiddenError('Only the template owner can update it');
  }
  try {
    const row = await prisma.reportTemplate.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.paramsJson !== undefined
          ? { paramsJson: patch.paramsJson as Prisma.InputJsonValue }
          : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      },
      include: { owner: { select: { displayName: true } } },
    });
    return toDetail(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new TemplateConflictError(
        `A template titled "${patch.title}" already exists for this report type`,
      );
    }
    throw err;
  }
}

export async function deleteTemplate(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
): Promise<void> {
  const existing = await prisma.reportTemplate.findUnique({ where: { id } });
  if (!existing) throw new TemplateNotFoundError(id);
  const isOwner = existing.ownerId === viewer.id;
  if (!isOwner && !viewer.isAdmin) {
    // Don't leak existence to viewers who can't see it at all.
    if (!canView(existing, viewer)) throw new TemplateNotFoundError(id);
    throw new TemplateForbiddenError('Only the owner or an admin can delete this template');
  }
  await prisma.reportTemplate.delete({ where: { id } });
}

export async function touchTemplate(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
): Promise<void> {
  const existing = await prisma.reportTemplate.findUnique({ where: { id } });
  if (!existing || !canView(existing, viewer)) throw new TemplateNotFoundError(id);
  await prisma.reportTemplate.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}
