"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's deployed client router currently throws on navigation; document links are intentional. */

import { useMemo, useState } from "react";
import type {
  PublicEvidenceAssociation,
} from "../lib/evidence/public-evidence";
import { useCivicPreferences } from "./CivicPreferences";
import styles from "./ApprovedEvidenceFeed.module.css";

type ConstituencyOption = {
  id: string;
  name: string;
};

const evidenceDateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export type ApprovedEvidenceFeedRecord = {
  associations: PublicEvidenceAssociation[];
  auditFingerprint: string;
  canonicalUrl: string;
  coverageSummary: string;
  firstSeenAt: string;
  itemType: string;
  publishedAt: string | null;
  reviewedAt: string;
  sourceName: string;
  title: string;
  versionId: string;
};

export type ApprovedEvidenceFeedSnapshot = {
  records: ApprovedEvidenceFeedRecord[];
  state: "available" | "empty" | "unavailable";
};

function dateLabel(value: string | null) {
  if (!value) return "Publication date not supplied";
  return evidenceDateFormatter.format(new Date(value));
}

function associationHref(association: PublicEvidenceAssociation) {
  return association.type === "candidate" && association.slug
    ? `/candidates/${association.slug}`
    : null;
}

function EvidenceCard({ record }: { record: ApprovedEvidenceFeedRecord }) {
  const sourceDate = record.publishedAt
    ? `Published ${dateLabel(record.publishedAt)}`
    : `Observed ${dateLabel(record.firstSeenAt)}`;
  return (
    <article className={styles.card}>
      <div className={styles.cardMeta}>
        <span>{sourceDate}</span>
        <span>{record.sourceName}</span>
        <span>{record.itemType.replaceAll("-", " ")}</span>
      </div>
      <h3>{record.title}</h3>
      <p className={styles.coverage}>{record.coverageSummary}</p>
      {record.associations.length ? (
        <div className={styles.associations} aria-label="Reviewed associations">
          {record.associations.map((association) => {
            const href = associationHref(association);
            return href ? (
              <a href={href} key={`${association.type}:${association.id}`}>
                <span>{association.type}</span>
                {association.label}
              </a>
            ) : (
              <span key={`${association.type}:${association.id}`}>
                <small>{association.type}</small>
                {association.label}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className={styles.cardFooter}>
        <small>
          Approved {dateLabel(record.reviewedAt)} · source-version fingerprint {record.auditFingerprint}
        </small>
        <a href={record.canonicalUrl} target="_blank" rel="noreferrer">
          Visit reviewed source page <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

function EvidenceGroup({
  empty,
  records,
  title,
}: {
  empty?: string;
  records: readonly ApprovedEvidenceFeedRecord[];
  title: string;
}) {
  return (
    <section className={styles.group} aria-label={title}>
      <div className={styles.groupHeading}>
        <h2>{title}</h2>
        <span>{records.length} source{records.length === 1 ? "" : "s"}</span>
      </div>
      {records.length ? records.map((record) => (
        <EvidenceCard key={record.versionId} record={record} />
      )) : (
        <div className={styles.empty}>
          <strong>No approved sources in this section yet</strong>
          <p>{empty ?? "Items will appear here only after editorial approval and publication."}</p>
        </div>
      )}
    </section>
  );
}

export function ApprovedEvidenceFeed({
  constituencies,
  snapshot,
}: {
  constituencies: readonly ConstituencyOption[];
  snapshot: ApprovedEvidenceFeedSnapshot;
}) {
  const { selectedConstituencyId, setSelectedConstituencyId } = useCivicPreferences();
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const selectedConstituency = constituencies.find((entry) => entry.id === selectedConstituencyId) ?? null;
  const topics = useMemo(() => {
    const topicMap = new Map<string, string>();
    for (const record of snapshot.records) {
      for (const association of record.associations) {
        if (association.type === "topic") topicMap.set(association.id, association.label);
      }
    }
    return [...topicMap].map(([id, label]) => ({ id, label })).toSorted((left, right) => left.label.localeCompare(right.label));
  }, [snapshot.records]);
  const topicFilteredRecords = selectedTopicId
    ? snapshot.records.filter((record) => record.associations.some(
        (association) => association.type === "topic" && association.id === selectedTopicId,
      ))
    : snapshot.records;
  const localRecords = selectedConstituency
    ? topicFilteredRecords.filter((record) => record.associations.some(
        (association) => association.type === "constituency" && association.id === selectedConstituency.id,
      ))
    : [];
  const islandWideRecords = topicFilteredRecords.filter((record) => !record.associations.some(
    (association) => association.type === "constituency",
  ));
  const elsewhereRecords = selectedConstituency
    ? topicFilteredRecords.filter((record) => (
        record.associations.some((association) => association.type === "constituency")
        && !record.associations.some(
          (association) => association.type === "constituency" && association.id === selectedConstituency.id,
        )
      ))
    : [];

  return (
    <div className={styles.feed}>
      <section className={styles.intro}>
        <div>
          <p>Approved evidence library</p>
          <h2>What the reviewed sources cover</h2>
          <span>
            A continuously updated record of published source metadata. Candidate association is not treated as a policy position or endorsement.
          </span>
        </div>
        <strong>{snapshot.records.length}<small>public sources</small></strong>
      </section>

      <div className={styles.filters}>
        <div>
          <span>Area of interest</span>
          <strong>{selectedConstituency?.name ?? "All constituencies"}</strong>
        </div>
        {selectedConstituency ? (
          <button type="button" onClick={() => setSelectedConstituencyId(null)}>Show every area</button>
        ) : (
          <a href="/#constituencies">Choose an area</a>
        )}
        <label>
          <span>Policy topic</span>
          <select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}>
            <option value="">Every reviewed topic</option>
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
          </select>
        </label>
      </div>

      {snapshot.state === "unavailable" ? (
        <div className={styles.unavailable} role="status">
          <strong>The approved evidence library is temporarily unavailable.</strong>
          <p>No private or fallback records are shown when the verified public projection cannot be loaded.</p>
        </div>
      ) : selectedConstituency ? (
        <>
          <EvidenceGroup
            empty="A reviewed source will appear here when its approved associations include this constituency or one of its candidates."
            records={localRecords}
            title={`For ${selectedConstituency.name}`}
          />
          {islandWideRecords.length ? <EvidenceGroup records={islandWideRecords} title="Across the election" /> : null}
          {elsewhereRecords.length ? <EvidenceGroup records={elsewhereRecords} title="Elsewhere around the Island" /> : null}
        </>
      ) : (
        <EvidenceGroup
          empty={selectedTopicId
            ? "No public source has completed review and publication for this topic yet."
            : "The first source will appear after an editor approves and publishes it."}
          records={topicFilteredRecords}
          title={selectedTopicId ? topics.find((topic) => topic.id === selectedTopicId)?.label ?? "Selected topic" : "Approved sources by source date"}
        />
      )}
    </div>
  );
}
