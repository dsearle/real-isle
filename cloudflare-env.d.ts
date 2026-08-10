export {};

declare global {
  namespace Cloudflare {
    interface Env {
      ADMIN_EMAILS?: string;
      ADMIN_USER_IDS?: string;
      DB: D1Database;
      INGESTION_SECRET?: string;
      SNAPSHOTS: R2Bucket;
    }
  }
}
