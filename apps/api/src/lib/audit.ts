import { auditLogs, type Db } from '@bot-op/db';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: unknown;
};

/** Call inside the same transaction as the change it records. */
export async function writeAudit(db: Db | Tx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    diff: entry.diff ?? null,
  });
}

/** Fields whose value changed, as { field: { from, to } }. */
export function diffFields<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[key];
    const same =
      from instanceof Date && to instanceof Date ? from.getTime() === to.getTime() : from === to;
    if (!same) out[key] = { from, to };
  }
  return out;
}
