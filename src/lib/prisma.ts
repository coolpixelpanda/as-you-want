const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientLike };

type PrismaClientLike = {
  $transaction: (fn: (tx: PrismaClientLike) => Promise<unknown>) => Promise<unknown>;
  appMeta: any;
  profile: any;
  experience: any;
  education: any;
  savedAnswer: any;
  application: any;
  storedFile: any;
};

export function usesPostgres() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  return /^postgres(ql)?:\/\//i.test(url);
}

export function getPrisma(): PrismaClientLike {
  if (!usesPostgres()) {
    throw new Error("DATABASE_URL must be a Postgres connection string.");
  }
  if (!globalForPrisma.prisma) {
    const { PrismaClient } = require("@prisma/client") as { PrismaClient: new (opts?: object) => PrismaClientLike };
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
