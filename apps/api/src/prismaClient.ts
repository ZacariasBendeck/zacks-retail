export * from '../generated/prisma-client-v7';

import { PrismaClient as GeneratedPrismaClient } from '../generated/prisma-client-v7';
import {
  registerPrismaSlowQueryLogging,
  withPrismaSlowQueryLogOption,
} from './observability/prismaLogging';

type PrismaClientOptions = ConstructorParameters<typeof GeneratedPrismaClient>[0];

export class PrismaClient extends GeneratedPrismaClient {
  constructor(options: PrismaClientOptions = {}) {
    const internal = (options as { __internal?: { configOverride?: (config: unknown) => unknown } }).__internal;
    const patchedOptions = withPrismaSlowQueryLogOption({
      ...(options as Record<string, unknown>),
      __internal: {
        ...internal,
        configOverride: (config: unknown) => {
          const nextConfig =
            typeof internal?.configOverride === 'function' ? internal.configOverride(config) : config;

          return {
            ...(nextConfig as Record<string, unknown>),
            copyEngine: true,
          };
        },
      },
    });

    super(patchedOptions as PrismaClientOptions);
    registerPrismaSlowQueryLogging(this);
  }
}
