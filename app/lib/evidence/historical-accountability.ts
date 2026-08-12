import { appendAuditEventWithStatements } from "./audit";
import { deterministicId, sha256Hex } from "./integrity";

type HistoricalTerm = {
  full_name: string;
  term_id: string;
};

type OfficialRecordVersion = {
  source_item_id: string;
  source_item_version_id: string;
  summary: string;
  title: string;
};

function escapedNamePattern(name: string) {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
}

/**
 * Adds conservative, immutable links between an elected member's 2021 term
 * and official parliamentary/government records already in the library.
 *
 * A link only says that the member's exact name appears in a tier-one record.
 * It deliberately makes no claim about attendance, a vote, influence, or
 * whether a manifesto commitment was delivered.
 */
export async function backfillHistoricalMemberActivityLinks(
  db: D1Database,
  actor: { id: string; type: "admin" | "system" },
  limit = 8,
) {
  const [terms, versions] = await Promise.all([
    db
      .prepare(
        `SELECT terms.id AS term_id, people.full_name
           FROM member_terms terms
           JOIN people ON people.id = terms.person_id
           JOIN elections ON elections.id = terms.election_id
          WHERE elections.id = 'hok-2021'
          ORDER BY people.full_name`,
      )
      .all<HistoricalTerm>(),
    db
      .prepare(
        `SELECT items.id AS source_item_id, versions.id AS source_item_version_id,
                items.title, items.summary
           FROM source_item_versions versions
           JOIN source_items items ON items.id = versions.source_item_id
           JOIN sources ON sources.id = items.source_id
          WHERE items.latest_version_id = versions.id
            AND sources.source_tier = 1
            AND sources.id != 'iom-elections-2021-results'
            AND NOT EXISTS (
              SELECT 1 FROM member_activity_scans scans
               WHERE scans.source_item_version_id = versions.id
            )
          ORDER BY COALESCE(items.published_at, versions.observed_at) DESC
          LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(limit, 20)))
      .all<OfficialRecordVersion>(),
  ]);

  let linked = 0;
  for (const version of versions.results) {
    const searchable = `${version.title}\n${version.summary}`;
    const matches = terms.results.filter((term) => escapedNamePattern(term.full_name).test(searchable));
    const linkRows = await Promise.all(matches.map(async (term) => ({
      id: await deterministicId("member-activity", version.source_item_version_id, term.term_id),
      mentionHash: await sha256Hex(term.full_name),
      mentionText: term.full_name,
      termId: term.term_id,
    })));
    await appendAuditEventWithStatements(
      db,
      {
        action: "historical-member.activity-linked",
        actorId: actor.id,
        actorType: actor.type,
        entityId: version.source_item_version_id,
        entityType: "source-item-version",
        payload: {
          linkCount: linkRows.length,
          mentionHashes: linkRows.map((row) => row.mentionHash),
          sourceItemId: version.source_item_id,
          sourceItemVersionId: version.source_item_version_id,
        },
      },
      (audit) => [
        db
          .prepare(
            `INSERT INTO member_activity_scans (
              source_item_version_id, source_item_id, outcome, created_by_audit_event_id
            ) VALUES (?, ?, ?, ?)`,
          )
          .bind(
            version.source_item_version_id,
            version.source_item_id,
            linkRows.length > 0 ? "linked" : "no-match",
            audit.id,
          ),
        ...linkRows.map((row) =>
          db
            .prepare(
              `INSERT INTO member_activity_links (
                id, member_term_id, source_item_version_id, source_item_id,
                link_kind, mention_text, mention_hash, created_by_audit_event_id
              ) VALUES (?, ?, ?, ?, 'official-record-reference', ?, ?, ?)
              ON CONFLICT(source_item_version_id, member_term_id) DO NOTHING`,
            )
            .bind(
              row.id,
              row.termId,
              version.source_item_version_id,
              version.source_item_id,
              row.mentionText,
              row.mentionHash,
              audit.id,
            ),
        ),
      ],
    );
    linked += linkRows.length;
  }
  return linked;
}
