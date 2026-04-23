import { Prisma, PrismaClient, ReportRun } from '@prisma/client';
import type { ReportType } from './reportTypes';
import type { ListScope, Visibility } from '../../routes/reports/schemas';

// Mirrors the templates service shape so the routes layer gets the same
// error → HTTP mapping contract.
export class RunNotFoundError extends Error {
  readonly code = 'RUN_NOT_FOUND';
  constructor(id: string) {
    super(`Snapshot ${id} not found`);
    this.name = 'RunNotFoundError';
  }
}

export class RunForbiddenError extends Error {
  readonly code = 'RUN_FORBIDDEN';
  constructor(reason: string) {
    super(reason);
    this.name = 'RunForbiddenError';
  }
}

export interface ViewerContext {
  id: string;
  isAdmin: boolean;
}

// Envelope-only row — list pages don't need to hydrate the full resultJson.
// Clients list 50 at a time; pulling 20 MB × 50 would melt browsers.
export interface RunSummary {
  id: string;
  userId: string;
  userDisplayName: string;
  reportType: string;
  sourceTemplateId: string | null;
  title: string | null;
  visibility: string;
  rowCount: number;
  resultSizeBytes: number;
  reportTypeVersion: number;
  createdAt: Date;
}

// Detail includes params + result (the whole point of fetching one).
export type RunDetail = RunSummary & {
  paramsJson: unknown;
  resultJson: unknown;
};

export interface CreateRunInput {
  userId: string;
  reportType: ReportType;
  title?: string;
  paramsJson: unknown;
  resultJson: unknown;
  visibility: Visibility;
  sourceTemplateId?: string;
}

export interface UpdateRunInput {
  title?: string;
  visibility?: Visibility;
}

type RowWithUser = ReportRun & { user: { displayName: string } };

function toSummary(row: RowWithUser): RunSummary {
  return {
    id: row.id,
    userId: row.userId,
    userDisplayName: row.user.displayName,
    reportType: row.reportType,
    sourceTemplateId: row.sourceTemplateId,
    title: row.title,
    visibility: row.visibility,
    rowCount: row.rowCount,
    resultSizeBytes: row.resultSizeBytes,
    reportTypeVersion: row.reportTypeVersion,
    createdAt: row.createdAt,
  };
}

function toDetail(row: RowWithUser): RunDetail {
  return { ...toSummary(row), paramsJson: row.paramsJson, resultJson: row.resultJson };
}

function canView(row: ReportRun, viewer: ViewerContext): boolean {
  if (viewer.isAdmin) return true;
  if (row.userId === viewer.id) return true;
  return row.visibility === 'shared';
}

// Heuristic row count — looks at conventional shapes we emit from reports
// and falls back to 0 when the payload has none of them. Stored on the row
// so the list view can show "N rows" without deserializing the blob.
// - { rows: [...] } — most sales reports
// - { roots: [...] } — the hierarchy drill-down (tree)
// - { blocks: [...] } — sales history by month
// - top-level array — simpler endpoints
function inferRowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.rows)) return (r.rows as unknown[]).length;
    if (Array.isArray(r.roots)) {
      // Tree: count leaves recursively so the displayed count matches what
      // the operator sees when they fully expand the tree.
      let n = 0;
      const walk = (nodes: unknown[]): void => {
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          const kids = (node as { children?: unknown[] }).children;
          if (Array.isArray(kids) && kids.length > 0) walk(kids);
          else n += 1;
        }
      };
      walk(r.roots as unknown[]);
      return n;
    }
    if (Array.isArray(r.blocks)) {
      // Sum rows across all blocks.
      let n = 0;
      for (const b of r.blocks as unknown[]) {
        const rows = (b as { rows?: unknown[] }).rows;
        if (Array.isArray(rows)) n += rows.length;
      }
      return n;
    }
  }
  return 0;
}

export async function createRun(
  prisma: PrismaClient,
  input: CreateRunInput,
): Promise<RunDetail> {
  const serialized = JSON.stringify(input.resultJson);
  const resultSizeBytes = Buffer.byteLength(serialized, 'utf8');
  const rowCount = inferRowCount(input.resultJson);

  // If sourceTemplateId was supplied, make sure it exists AND the viewer can
  // see it — otherwise null it out silently so a stale / forbidden reference
  // can't poison the relation.
  let sourceTemplateId: string | null = input.sourceTemplateId ?? null;
  if (sourceTemplateId) {
    const tpl = await prisma.reportTemplate.findUnique({
      where: { id: sourceTemplateId },
      select: { id: true, ownerId: true, visibility: true },
    });
    if (!tpl) {
      sourceTemplateId = null;
    } else if (tpl.ownerId !== input.userId && tpl.visibility !== 'shared') {
      sourceTemplateId = null;
    }
  }

  const row = await prisma.reportRun.create({
    data: {
      userId: input.userId,
      reportType: input.reportType,
      title: input.title ?? null,
      paramsJson: input.paramsJson as Prisma.InputJsonValue,
      resultJson: input.resultJson as Prisma.InputJsonValue,
      rowCount,
      resultSizeBytes,
      visibility: input.visibility,
      sourceTemplateId,
    },
    include: { user: { select: { displayName: true } } },
  });
  return toDetail(row);
}

export async function listRuns(
  prisma: PrismaClient,
  viewer: ViewerContext,
  args: {
    scope: ListScope;
    reportType?: ReportType;
    sourceTemplateId?: string;
    limit: number;
    offset: number;
  },
): Promise<{ runs: RunSummary[]; total: number }> {
  const where: Prisma.ReportRunWhereInput = {
    ...(args.reportType ? { reportType: args.reportType } : {}),
    ...(args.sourceTemplateId ? { sourceTemplateId: args.sourceTemplateId } : {}),
    ...(args.scope === 'mine'
      ? { userId: viewer.id }
      : viewer.isAdmin
        ? {}
        : { OR: [{ userId: viewer.id }, { visibility: 'shared' }] }),
  };
  // Paired count + find so the UI can show "showing 1-50 of 237". Both reads
  // hit the same index the plan calls out (user_id + created_at DESC or
  // visibility + report_type + created_at DESC).
  const [total, rows] = await Promise.all([
    prisma.reportRun.count({ where }),
    prisma.reportRun.findMany({
      where,
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: args.limit,
      skip: args.offset,
    }),
  ]);
  return { runs: rows.map(toSummary), total };
}

export async function getRun(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
): Promise<RunDetail> {
  const row = await prisma.reportRun.findUnique({
    where: { id },
    include: { user: { select: { displayName: true } } },
  });
  if (!row || !canView(row, viewer)) {
    // Same leak-avoiding 404 the templates service uses — don't tell an
    // unauthorized viewer that the run exists.
    throw new RunNotFoundError(id);
  }
  return toDetail(row);
}

export async function updateRun(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
  patch: UpdateRunInput,
): Promise<RunDetail> {
  const existing = await prisma.reportRun.findUnique({ where: { id } });
  if (!existing || !canView(existing, viewer)) throw new RunNotFoundError(id);
  // Only the owner may edit. Admins read everything but cannot rewrite
  // someone else's label — matches the templates pattern.
  if (existing.userId !== viewer.id) {
    throw new RunForbiddenError('Only the snapshot owner can update it');
  }
  const row = await prisma.reportRun.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    },
    include: { user: { select: { displayName: true } } },
  });
  return toDetail(row);
}

export async function deleteRun(
  prisma: PrismaClient,
  viewer: ViewerContext,
  id: string,
): Promise<void> {
  const existing = await prisma.reportRun.findUnique({ where: { id } });
  if (!existing) throw new RunNotFoundError(id);
  const isOwner = existing.userId === viewer.id;
  if (!isOwner && !viewer.isAdmin) {
    if (!canView(existing, viewer)) throw new RunNotFoundError(id);
    throw new RunForbiddenError('Only the owner or an admin can delete this snapshot');
  }
  await prisma.reportRun.delete({ where: { id } });
}
