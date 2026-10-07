import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, tstz } from './common';
import { users } from './org';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id),
    /** e.g. create | update | delete | import | price_add */
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    diff: jsonb('diff'),
    at: tstz('at').notNull().defaultNow(),
  },
  (t) => [index('audit_logs_entity_idx').on(t.entity, t.entityId)],
);
