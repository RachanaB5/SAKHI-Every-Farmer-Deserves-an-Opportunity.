// Audit trail writer used by admin decisions, deliveries and payments.
import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Appends an AuditLog row.
 * @param entry - who did what to which entity, plus optional JSON metadata
 * @param tx - optional transaction client so the log commits atomically with the change
 */
export async function audit(
  entry: {
    actorId?: string | null;
    action: string;
    entity: string;
    entityId: string;
    meta?: Prisma.InputJsonValue;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({ data: { ...entry, actorId: entry.actorId ?? null } });
}
