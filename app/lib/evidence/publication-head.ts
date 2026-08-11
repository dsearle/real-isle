export type PublicPublicationHead = {
  head: string;
};

type PublicationHeadDatabase = Pick<D1Database, "prepare">;

const PUBLICATION_HEAD = /^[0-9a-f]{32}$/;

export const publicPublicationHeadSql = `
  SELECT head
    FROM public_publication_head
   WHERE singleton = 1
   LIMIT 1
`;

export async function queryPublicPublicationHead(
  db: PublicationHeadDatabase,
): Promise<PublicPublicationHead> {
  const row = await db
    .prepare(publicPublicationHeadSql)
    .first<{ head: string }>();
  if (!row || typeof row.head !== "string" || !PUBLICATION_HEAD.test(row.head)) {
    throw new Error("The public publication head is unavailable.");
  }
  return { head: row.head };
}

export async function getPublicPublicationHead() {
  // Defer the Workers-only environment import so Node contract tests and
  // static tooling can import this read-only public projection safely.
  const { getEvidenceBindings } = await import("../../../db");
  return queryPublicPublicationHead(getEvidenceBindings().DB);
}
