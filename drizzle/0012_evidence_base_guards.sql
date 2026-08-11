DROP TRIGGER IF EXISTS `audit_event_chain_guard`;--> statement-breakpoint
CREATE TRIGGER `audit_event_chain_guard`
BEFORE INSERT ON `audit_events`
BEGIN
  SELECT CASE
    WHEN NEW.sequence != (SELECT next_sequence FROM audit_chain_head WHERE chain_id = 1)
    THEN RAISE(ABORT, 'audit sequence mismatch')
  END;
  SELECT CASE
    WHEN NEW.previous_event_hash IS NOT (SELECT last_event_hash FROM audit_chain_head WHERE chain_id = 1)
    THEN RAISE(ABORT, 'audit previous hash mismatch')
  END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `audit_event_chain_advance`;--> statement-breakpoint
CREATE TRIGGER `audit_event_chain_advance`
AFTER INSERT ON `audit_events`
BEGIN
  UPDATE audit_chain_head
     SET next_sequence = NEW.sequence + 1,
         last_event_hash = NEW.event_hash,
         updated_at = CURRENT_TIMESTAMP
   WHERE chain_id = 1;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `audit_events_no_update`;--> statement-breakpoint
CREATE TRIGGER `audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `audit_events_no_delete`;--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_snapshots_no_update`;--> statement-breakpoint
CREATE TRIGGER `source_snapshots_no_update`
BEFORE UPDATE ON `source_snapshots`
BEGIN SELECT RAISE(ABORT, 'source snapshots are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_snapshots_no_delete`;--> statement-breakpoint
CREATE TRIGGER `source_snapshots_no_delete`
BEFORE DELETE ON `source_snapshots`
BEGIN SELECT RAISE(ABORT, 'source snapshots are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_versions_no_update`;--> statement-breakpoint
CREATE TRIGGER `source_item_versions_no_update`
BEFORE UPDATE ON `source_item_versions`
BEGIN SELECT RAISE(ABORT, 'source item versions are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `source_item_versions_no_delete`;--> statement-breakpoint
CREATE TRIGGER `source_item_versions_no_delete`
BEFORE DELETE ON `source_item_versions`
BEGIN SELECT RAISE(ABORT, 'source item versions are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `collection_assessments_no_update`;--> statement-breakpoint
CREATE TRIGGER `collection_assessments_no_update`
BEFORE UPDATE ON `source_item_version_collection_assessments`
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `collection_assessments_no_delete`;--> statement-breakpoint
CREATE TRIGGER `collection_assessments_no_delete`
BEFORE DELETE ON `source_item_version_collection_assessments`
BEGIN SELECT RAISE(ABORT, 'collection assessments are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_profile_observations_no_update`;--> statement-breakpoint
CREATE TRIGGER `candidate_profile_observations_no_update`
BEFORE UPDATE ON `candidate_profile_observations`
BEGIN SELECT RAISE(ABORT, 'candidate profile observations are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `candidate_profile_observations_no_delete`;--> statement-breakpoint
CREATE TRIGGER `candidate_profile_observations_no_delete`
BEFORE DELETE ON `candidate_profile_observations`
BEGIN SELECT RAISE(ABORT, 'candidate profile observations are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `revisions_no_update`;--> statement-breakpoint
CREATE TRIGGER `revisions_no_update`
BEFORE UPDATE ON `revisions`
BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `revisions_no_delete`;--> statement-breakpoint
CREATE TRIGGER `revisions_no_delete`
BEFORE DELETE ON `revisions`
BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transcripts_content_no_update`;--> statement-breakpoint
CREATE TRIGGER `transcripts_content_no_update`
BEFORE UPDATE OF job_id, revision_number, parent_transcript_id, candidacy_id,
  source_snapshot_id, title, language, source_kind, producer, producer_version,
  config_hash, content_hash, storage_key, word_count, duration_seconds,
  segment_count, generated_at, created_at
ON `transcripts`
BEGIN SELECT RAISE(ABORT, 'transcript content is immutable; create a revision'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transcripts_candidate_guard`;--> statement-breakpoint
CREATE TRIGGER `transcripts_candidate_guard`
BEFORE INSERT ON `transcripts`
WHEN NEW.candidacy_id IS NOT (
  SELECT candidacy_id FROM transcript_jobs WHERE id = NEW.job_id
)
BEGIN SELECT RAISE(ABORT, 'transcript candidacy does not match its job'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transcripts_no_delete`;--> statement-breakpoint
CREATE TRIGGER `transcripts_no_delete`
BEFORE DELETE ON `transcripts`
BEGIN SELECT RAISE(ABORT, 'transcript versions are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transcript_segments_content_no_update`;--> statement-breakpoint
CREATE TRIGGER `transcript_segments_content_no_update`
BEFORE UPDATE OF transcript_id, segment_index, start_milliseconds,
  end_milliseconds, speaker_label, text, start_offset, end_offset,
  content_hash, confidence, created_at
ON `transcript_segments`
BEGIN SELECT RAISE(ABORT, 'transcript segment content is immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transcript_segments_no_delete`;--> statement-breakpoint
CREATE TRIGGER `transcript_segments_no_delete`
BEFORE DELETE ON `transcript_segments`
BEGIN SELECT RAISE(ABORT, 'transcript segments are immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `evidence_transcript_segment_guard`;--> statement-breakpoint
CREATE TRIGGER `evidence_transcript_segment_guard`
BEFORE INSERT ON `evidence`
WHEN NEW.transcript_segment_id IS NOT NULL
  AND NEW.transcript_id IS NOT (
    SELECT transcript_id FROM transcript_segments WHERE id = NEW.transcript_segment_id
  )
BEGIN SELECT RAISE(ABORT, 'evidence segment does not belong to transcript'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `evidence_transcript_segment_update_guard`;--> statement-breakpoint
CREATE TRIGGER `evidence_transcript_segment_update_guard`
BEFORE UPDATE OF transcript_id, transcript_segment_id ON `evidence`
WHEN NEW.transcript_segment_id IS NOT NULL
  AND NEW.transcript_id IS NOT (
    SELECT transcript_id FROM transcript_segments WHERE id = NEW.transcript_segment_id
  )
BEGIN SELECT RAISE(ABORT, 'evidence segment does not belong to transcript'); END;--> statement-breakpoint
PRAGMA foreign_key_check;
