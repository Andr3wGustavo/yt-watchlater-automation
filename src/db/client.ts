import { PrismaClient } from '@prisma/client';

// Singleton pattern para evitar múltiplas conexões em dev (hot-reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.LOG_LEVEL === 'debug'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Desconecta o Prisma (para graceful shutdown).
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
