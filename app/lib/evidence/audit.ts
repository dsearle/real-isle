import { randomId, sha256Hex, stableJson } from "./integrity.ts";

const AUDIT_SCHEMA = "real-isle.audit.v1";

export type AuditEventInput = {
  action: string;
  actorId: string;
  actorType: "system" | "admin" | "reviewer" | "candidate" | "contributor";
  entityId: string;
  entityType: string;
  payload: Record<string, unknown>;
};

type AuditHead = {
  last_event_hash: string;
  next_sequence: number;
};

export type AppendedAuditEvent = {
  createdAt: string;
  eventHash: string;
  id: string;
  sequence: number;
};

export async function appendAuditEventWithStatements(
  db: D1Database,
  input: AuditEventInput,
  buildStatements: (event: AppendedAuditEvent) => D1PreparedStatement[],
  buildDependentStatements: (event: AppendedAuditEvent) => D1PreparedStatement[] = () => [],
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await db
      .prepare(
        "SELECT next_sequence, last_event_hash FROM audit_chain_head WHERE chain_id = 1",
      )
      .first<AuditHead>();
    if (!head) throw new Error("The audit chain head has not been initialised.");

    const createdAt = new Date().toISOString();
    const payload = stableJson(input.payload);
    const payloadHash = await sha256Hex(payload);
    const eventHash = await sha256Hex(
      stableJson({
        action: input.action,
        actorId: input.actorId,
        actorType: input.actorType,
        createdAt,
        entityId: input.entityId,
        entityType: input.entityType,
        payloadHash,
        previousEventHash: head.last_event_hash,
        schema: AUDIT_SCHEMA,
        sequence: head.next_sequence,
      }),
    );
    const id = randomId("audit");
    const event = {
      createdAt,
      eventHash,
      id,
      sequence: head.next_sequence,
    } satisfies AppendedAuditEvent;

    try {
      await db.batch([
        ...buildStatements(event),
        db.prepare(
          `INSERT INTO audit_events (
            sequence, id, actor_type, actor_id, action, entity_type, entity_id,
            payload, payload_hash, previous_event_hash, event_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          head.next_sequence,
          id,
          input.actorType,
          input.actorId,
          input.action,
          input.entityType,
          input.entityId,
          payload,
          payloadHash,
          head.last_event_hash,
          eventHash,
          createdAt,
        ),
        ...buildDependentStatements(event),
      ]);
      return event;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2 || !message.includes("audit")) throw error;
    }
  }
  throw new Error("The audit event could not be serialised after three attempts.");
}

export function appendAuditEvent(db: D1Database, input: AuditEventInput) {
  return appendAuditEventWithStatements(db, input, () => []);
}
