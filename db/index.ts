import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type EvidenceBindings = Pick<Cloudflare.Env, "DB" | "INGESTION_SECRET" | "SNAPSHOTS">;

export function getEvidenceBindings(): EvidenceBindings {
  if (!env.DB || !env.SNAPSHOTS) {
    throw new Error(
      "The Real Isle evidence store is unavailable because its D1 or R2 binding is missing.",
    );
  }
  return {
    DB: env.DB,
    INGESTION_SECRET: env.INGESTION_SECRET,
    SNAPSHOTS: env.SNAPSHOTS,
  };
}

export function getDb() {
  return drizzle(getEvidenceBindings().DB, { schema });
}
