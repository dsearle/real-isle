import type { MonitoredSource } from "./catalogue.ts";
import {
  candidateCatalogue,
  constituencyCatalogue,
  election,
  historicalElectionCatalogue,
  monitoredSources,
  policyTopicCatalogue,
} from "./catalogue.ts";
import { ensureEvidenceTriggers } from "./triggers.ts";

function sortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const last = parts.pop() ?? fullName;
  return `${last}, ${parts.join(" ")}`.trim();
}

function sourceStatement(db: D1Database, source: MonitoredSource) {
  return db
    .prepare(
      `INSERT INTO sources (
        id, name, publisher, homepage_url, feed_url, feed_type, source_tier,
        active, poll_interval_minutes, rights_state, store_full_content, next_check_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT next_check_at FROM sources WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      source.id,
      source.name,
      source.publisher,
      source.homepageUrl,
      source.feedUrl,
      source.feedType,
      source.sourceTier,
      source.active ? 1 : 0,
      source.pollIntervalMinutes,
      source.rightsState,
      source.storeFullContent ? 1 : 0,
      source.id,
    );
}

export async function seedEvidenceReferenceData(db: D1Database) {
  await ensureEvidenceTriggers(db);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO elections (id, name, status, updated_at)
         VALUES (?, ?, 'upcoming', CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(election.id, election.name),
  ];

  for (const historicalElection of historicalElectionCatalogue) {
    statements.push(
      db
        .prepare(
          `INSERT INTO elections (id, name, election_date, status, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          historicalElection.id,
          historicalElection.name,
          historicalElection.electionDate,
          historicalElection.status,
        ),
    );
  }

  for (const constituency of constituencyCatalogue) {
    statements.push(
      db
        .prepare(
          `INSERT INTO constituencies (id, name, seats, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(constituency.id, constituency.name, constituency.seats),
    );
  }

  for (const candidate of candidateCatalogue) {
    statements.push(
      db
        .prepare(
          `INSERT INTO people (id, full_name, sort_name, profile_state, updated_at)
           VALUES (?, ?, ?, 'reviewed', CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(candidate.id, candidate.fullName, sortName(candidate.fullName)),
      db
        .prepare(
          `INSERT INTO candidacies (
            id, election_id, person_id, constituency_id, affiliation,
            declaration_status, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'prospective', CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          `${election.id}:${candidate.id}`,
          election.id,
          candidate.id,
          candidate.constituencyId,
          candidate.affiliation,
        ),
    );
  }

  for (const topic of policyTopicCatalogue) {
    statements.push(
      db
        .prepare(
          `INSERT INTO policy_topics (id, name, active, updated_at)
           VALUES (?, ?, 1, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(topic.id, topic.name),
    );
  }

  for (const source of monitoredSources) statements.push(sourceStatement(db, source));
  if (statements.length > 0) await db.batch(statements);
}
