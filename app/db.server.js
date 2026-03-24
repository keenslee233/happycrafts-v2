import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.INTERNAL_DATABASE_URL || process.env.DATABASE_URL;

const prisma = global.prismaGlobal ?? new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export default prisma;
