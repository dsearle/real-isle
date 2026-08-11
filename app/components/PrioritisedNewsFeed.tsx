"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's deployed client router currently throws on navigation; document links are intentional. */

import type { ElectionUpdate } from "../lib/data";
import { useCivicPreferences } from "./CivicPreferences";
import styles from "./PrioritisedNewsFeed.module.css";

type ConstituencyOption = {
  id: string;
  name: string;
};

function byNewest(left: ElectionUpdate, right: ElectionUpdate) {
  return right.sortDate.localeCompare(left.sortDate);
}

function UpdateCard({ update }: { update: ElectionUpdate }) {
  return (
    <article>
      <div>
        <div className="feed-meta">
          <span>{update.dateQualifier} {update.date} 2026</span>
          <span>{update.source}</span>
          <span className={`evidence-pill ${update.stateClass}`}>{update.state}</span>
        </div>
        <h2>{update.title}</h2>
        <p>{update.summary}</p>
        <a href={update.url} target="_blank" rel="noreferrer">Visit reviewed source page ↗</a>
      </div>
    </article>
  );
}

function FeedGroup({
  eyebrow,
  emptyMessage,
  id,
  updates,
}: {
  eyebrow: string;
  emptyMessage?: string;
  id: string;
  updates: readonly ElectionUpdate[];
}) {
  return (
    <section aria-labelledby={id} className={styles.group}>
      <div className={styles.groupHeading}>
        <span id={id}>{eyebrow}</span>
        <small>{updates.length} reviewed update{updates.length === 1 ? "" : "s"}</small>
      </div>
      {updates.length ? updates.map((update) => <UpdateCard key={update.url} update={update} />) : (
        <div className={styles.emptyState}>
          <strong>Nothing reviewed for this area yet</strong>
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

export function PrioritisedNewsFeed({
  constituencies,
  updates,
}: {
  constituencies: readonly ConstituencyOption[];
  updates: readonly ElectionUpdate[];
}) {
  const { selectedConstituencyId, setSelectedConstituencyId } = useCivicPreferences();
  const selected = constituencies.find((constituency) => constituency.id === selectedConstituencyId) ?? null;

  const localUpdates = selected
    ? updates
        .filter((update) => update.constituencyIds.includes(selected.id))
        .toSorted(byNewest)
    : [];
  const islandWideUpdates = updates
    .filter((update) => update.constituencyIds.length === 0)
    .toSorted(byNewest);
  const elsewhereUpdates = selected
    ? updates
        .filter(
          (update) => update.constituencyIds.length > 0 && !update.constituencyIds.includes(selected.id),
        )
        .toSorted(byNewest)
    : [];

  return (
    <div className={`desk-feed ${styles.feed}`}>
      <div className={styles.contextBar}>
        {selected ? (
          <>
            <div>
              <span>Area of interest</span>
              <strong>{selected.name}</strong>
            </div>
            <button type="button" onClick={() => setSelectedConstituencyId(null)}>Clear</button>
          </>
        ) : (
          <>
            <div>
              <span>No area selected</span>
              <strong>Showing reviewed updates from across the Island</strong>
            </div>
            <a href="/#constituencies">Choose an area</a>
          </>
        )}
      </div>

      <div className={styles.curationNote}>
        <span>Current briefing status</span>
        <strong>Human-curated, not an automatic monitor feed.</strong>
        <p>Source checks can discover new material, but those records do not appear here until a separate editorial publication decision is complete.</p>
      </div>

      {selected ? (
        <>
          <FeedGroup
            eyebrow={`For ${selected.name}`}
            emptyMessage="We will place an update here only when its reviewed evidence explicitly relates to this constituency."
            id="local-election-updates"
            updates={localUpdates}
          />
          <FeedGroup eyebrow="Island-wide" id="island-wide-election-updates" updates={islandWideUpdates} />
          {elsewhereUpdates.length ? (
            <FeedGroup eyebrow="Around the Island" id="other-election-updates" updates={elsewhereUpdates} />
          ) : null}
        </>
      ) : (
        <FeedGroup
          eyebrow="Curated reviewed updates"
          id="all-election-updates"
          updates={updates.toSorted(byNewest)}
        />
      )}
    </div>
  );
}
