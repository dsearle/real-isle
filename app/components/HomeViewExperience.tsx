"use client";

import { useState, useSyncExternalStore } from "react";
import type { PublicMonitorSnapshot } from "../lib/evidence/public-monitor";
import { useCivicPreferences } from "./CivicPreferences";
import { IslandTerrain, type TerrainAnchorPosition } from "./IslandTerrain";
import { PublicMonitorPanel } from "./PublicMonitorPanel";
import styles from "./HomeViewExperience.module.css";

const HOME_VIEW_STORAGE_KEY = "peoples-isle.home-view.v1";
const homeViewChangeEvent = "peoples-isle:home-view-change";

type HomeView = "atlas" | "desk";
let fallbackHomeView: HomeView = "atlas";
let homeViewInitialised = false;

function getHomeViewSnapshot(): HomeView {
  if (!homeViewInitialised) {
    try {
      fallbackHomeView = window.localStorage.getItem(HOME_VIEW_STORAGE_KEY) === "desk"
        ? "desk"
        : "atlas";
    } catch {
      // The in-memory value remains authoritative when storage is unavailable.
    }
    homeViewInitialised = true;
  }
  return fallbackHomeView;
}

function subscribeToHomeView(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === HOME_VIEW_STORAGE_KEY) {
      fallbackHomeView = event.newValue === "desk" ? "desk" : "atlas";
      homeViewInitialised = true;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(homeViewChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(homeViewChangeEvent, onStoreChange);
  };
}

function saveHomeView(nextView: HomeView) {
  fallbackHomeView = nextView;
  homeViewInitialised = true;
  try {
    window.localStorage.setItem(HOME_VIEW_STORAGE_KEY, nextView);
  } catch {
    // The switch still works for this visit when persistence is unavailable.
  }
  window.dispatchEvent(new Event(homeViewChangeEvent));
}

export type HomeConstituency = {
  id: string;
  name: string;
  short: string;
  x: number;
  y: number;
};

export type HomeCandidate = {
  constituencyId: string;
  evidenceCount: number;
  initials: string;
  name: string;
  /** App-owned portrait URL that has already passed public reuse and publication review. */
  portraitUrl?: string | null;
  priorities: readonly string[];
  slug: string;
  status: string;
  summary: string;
};

export type HomeUpdate = {
  candidateSlugs: readonly string[];
  constituencyIds: readonly string[];
  date: string;
  dateQualifier: "Checked" | "Published" | "Reviewed";
  sortDate: string;
  source: string;
  state: string;
  stateClass: string;
  summary: string;
  title: string;
  url: string;
};

function byNewest(left: HomeUpdate, right: HomeUpdate) {
  return right.sortDate.localeCompare(left.sortDate);
}

function CandidatePortrait({
  candidate,
  className = "",
}: {
  candidate: HomeCandidate;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.playerPortrait} ${className}`.trim()}
    >
      {candidate.portraitUrl ? (
        // This URL is deliberately restricted to an app-owned, rights-cleared public asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          decoding="async"
          height={160}
          loading="lazy"
          src={candidate.portraitUrl}
          width={128}
        />
      ) : (
        <span className={styles.playerMonogram}>{candidate.initials}</span>
      )}
    </span>
  );
}

function CandidatePlayerCard({
  candidate,
  constituencyName,
  variant,
}: {
  candidate: HomeCandidate;
  constituencyName: string;
  variant: "mini" | "selected" | "mobile";
}) {
  const variantClass = variant === "mini"
    ? styles.atlasPlayerCardMini
    : variant === "selected"
      ? styles.atlasPlayerCardSelected
      : styles.atlasPlayerCardMobile;

  return (
    <a
      aria-label={`Open evidence profile for ${candidate.name}, ${constituencyName}`}
      className={`${styles.atlasPlayerCard} ${variantClass}`}
      href={`/candidates/${candidate.slug}`}
    >
      <CandidatePortrait candidate={candidate} />
      <span className={styles.atlasPlayerCopy}>
        <strong>{candidate.name}</strong>
        {variant === "mini" ? null : <small>{candidate.status} · Profile ↗</small>}
      </span>
    </a>
  );
}

function RegionChooser({
  compact = false,
  constituencies,
  onSelect,
  selectedId,
}: {
  compact?: boolean;
  constituencies: readonly HomeConstituency[];
  onSelect: (constituencyId: string) => void;
  selectedId: string | null;
}) {
  return (
    <div className={compact ? styles.regionChooserCompact : styles.regionChooser}>
      <div className={styles.regionChooserHeading}>
        <div>
          <span>Area of interest</span>
          <h2>{selectedId ? "Change your area" : "Choose a constituency"}</h2>
        </div>
        <small>Saved only on this device</small>
      </div>
      <div className={styles.regionGrid} role="group" aria-label="Choose one constituency as your area of interest">
        {constituencies.map((constituency) => (
          <button
            aria-pressed={selectedId === constituency.id}
            className={selectedId === constituency.id ? styles.regionActive : undefined}
            key={constituency.id}
            onClick={() => onSelect(constituency.id)}
            type="button"
          >
            <span>{constituency.short}</span>
            <strong>{constituency.name}</strong>
          </button>
        ))}
      </div>
      <p className={styles.privacyNote}>
        This is a preference, not a claim about where you live. No account, address or postcode is requested.
      </p>
    </div>
  );
}

function CandidateCollection({
  candidates,
  emptyArea,
}: {
  candidates: readonly HomeCandidate[];
  emptyArea: string;
}) {
  if (!candidates.length) {
    return (
      <div className={styles.emptyPanel}>
        <span aria-hidden="true">⌁</span>
        <div>
          <strong>No reviewed profile for {emptyArea} yet</strong>
          <p>Prospective candidates appear here only after their declaration source and identity have been checked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.candidateGrid}>
      {candidates.map((candidate) => (
        <a className={styles.candidateCard} href={`/candidates/${candidate.slug}`} key={candidate.slug}>
          <div className={styles.candidateAvatar}>
            <CandidatePortrait candidate={candidate} className={styles.candidatePortraitFrame} />
          </div>
          <div className={styles.candidateCopy}>
            <div>
              <span>{candidate.status}</span>
              <small>{candidate.evidenceCount} reviewed source{candidate.evidenceCount === 1 ? "" : "s"}</small>
            </div>
            <h3>{candidate.name}</h3>
            <p>{candidate.summary}</p>
            <ul aria-label={`${candidate.name}'s stated priorities`}>
              {candidate.priorities.slice(0, 2).map((priority) => <li key={priority}>{priority}</li>)}
            </ul>
            <strong className={styles.openProfile}>Open evidence profile <span aria-hidden="true">↗</span></strong>
          </div>
        </a>
      ))}
    </div>
  );
}

function UpdateCollection({
  localArea,
  updates,
}: {
  localArea: string | null;
  updates: readonly HomeUpdate[];
}) {
  return (
    <div className={styles.updateStack}>
      {updates.map((update) => (
        <article className={styles.updateCard} key={update.url}>
          <div className={styles.updateMeta}>
            <span>{update.dateQualifier} {update.date} · {update.source}</span>
            <strong>
              {localArea ? `For ${localArea}` : update.constituencyIds.length ? "Constituency" : "Island-wide"}
            </strong>
          </div>
          <h3>{update.title}</h3>
          <p>{update.summary}</p>
          <a href={update.url} target="_blank" rel="noreferrer">Read original source ↗</a>
        </article>
      ))}
    </div>
  );
}

function CandidateAtlasMap({
  boundarySourceUrl,
  candidates,
  constituencies,
  onSelect,
  selectedId,
}: {
  boundarySourceUrl: string;
  candidates: readonly HomeCandidate[];
  constituencies: readonly HomeConstituency[];
  onSelect: (constituencyId: string) => void;
  selectedId: string | null;
}) {
  const [anchorPositions, setAnchorPositions] = useState<Record<string, TerrainAnchorPosition>>({});
  const candidatesByConstituency = new Map<string, HomeCandidate[]>();
  candidates
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-GB"))
    .forEach((candidate) => {
      const areaCandidates = candidatesByConstituency.get(candidate.constituencyId) ?? [];
      areaCandidates.push(candidate);
      candidatesByConstituency.set(candidate.constituencyId, areaCandidates);
    });

  const selected = constituencies.find((constituency) => constituency.id === selectedId) ?? null;
  const selectedCandidates = selected ? candidatesByConstituency.get(selected.id) ?? [] : [];
  const terrainAnchors = constituencies.map((constituency) => ({
    id: constituency.id,
    x: constituency.x,
    y: constituency.y,
  }));

  return (
    <div className={`${styles.atlasMapStage} ${selected ? styles.atlasMapStageSelected : ""}`}>
      <h1 className={styles.visuallyHidden}>The People’s Isle — Your Isle, Your Future</h1>
      <p className={styles.visuallyHidden}>
        Your selected area is saved only on this device. No account, address or postcode is requested.
      </p>
      <div className={styles.atlasMapGuide} aria-hidden="true">
        <strong>Choose an area</strong>
        <span>Candidate cards open their evidence profiles</span>
      </div>

      <label className={styles.atlasAreaSelect}>
        <span>Choose an area</span>
        <select
          onChange={(event) => {
            if (event.target.value) onSelect(event.target.value);
          }}
          value={selectedId ?? ""}
        >
          <option value="">Select a constituency</option>
          {constituencies.map((constituency) => (
            <option key={constituency.id} value={constituency.id}>{constituency.name}</option>
          ))}
        </select>
      </label>

      <div className={styles.terrainFrame}>
        <IslandTerrain
          anchors={terrainAnchors}
          onAnchorPositions={setAnchorPositions}
          presentation="atlas"
        />
      </div>

      <div
        aria-label="Choose one Isle of Man constituency using representative points; boundaries are not shown"
        className={styles.atlasHotspotLayer}
        role="group"
      >
        {constituencies.map((constituency) => {
          const areaCandidates = candidatesByConstituency.get(constituency.id) ?? [];
          const isSelected = constituency.id === selectedId;
          const anchorPosition = anchorPositions[constituency.id];
          const profileLabel = `${areaCandidates.length} reviewed candidate profile${areaCandidates.length === 1 ? "" : "s"}`;
          const clusterClass = [
            styles.atlasMarker,
            isSelected ? styles.atlasMarkerSelected : "",
            !anchorPosition?.visible ? styles.atlasMarkerPending : "",
          ].filter(Boolean).join(" ");

          return (
            <div
              className={clusterClass}
              data-constituency={constituency.id}
              key={constituency.id}
              style={{
                left: `${anchorPosition?.left ?? 50}%`,
                top: `${anchorPosition?.top ?? 50}%`,
              }}
            >
              <i className={styles.atlasLeader} aria-hidden="true" />
              <button
                aria-label={`Choose ${constituency.name}, ${profileLabel}`}
                aria-pressed={isSelected}
                className={styles.atlasHotspot}
                onClick={() => onSelect(constituency.id)}
                type="button"
              >
                <span>{constituency.short}</span>
                <strong>{constituency.name}</strong>
              </button>

              {areaCandidates.length ? (
                <>
                  {!isSelected ? (
                    <div className={styles.atlasPlayerDeck}>
                      {areaCandidates.map((candidate) => (
                        <CandidatePlayerCard
                          candidate={candidate}
                          constituencyName={constituency.name}
                          key={candidate.slug}
                          variant="mini"
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.atlasPlayerDeckMobile} aria-hidden="true">
                    {areaCandidates.map((candidate) => (
                      <span className={styles.atlasPlayerPreview} key={candidate.slug}>
                        <CandidatePortrait candidate={candidate} />
                      </span>
                    ))}
                  </div>
                  {isSelected ? (
                    <div className={styles.atlasProfiles}>
                      {areaCandidates.map((candidate) => (
                        <CandidatePlayerCard
                          candidate={candidate}
                          constituencyName={constituency.name}
                          key={candidate.slug}
                          variant="selected"
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className={styles.visuallyHidden} aria-live="polite">
        {selected
          ? `${selected.name} selected. ${selectedCandidates.length} reviewed candidate profile${selectedCandidates.length === 1 ? "" : "s"}.`
          : "No constituency selected."}
      </p>

      {selected ? (
        <div className={styles.atlasMobileSheet}>
          <div>
            <span>{selected.short}</span>
            <strong>{selected.name}</strong>
          </div>
          {selectedCandidates.length ? (
            <nav aria-label={`Reviewed candidate profiles for ${selected.name}`}>
              {selectedCandidates.map((candidate) => (
                <CandidatePlayerCard
                  candidate={candidate}
                  constituencyName={selected.name}
                  key={candidate.slug}
                  variant="mobile"
                />
              ))}
            </nav>
          ) : (
            <small>No reviewed candidate profile yet</small>
          )}
        </div>
      ) : null}

      <div className={styles.atlasMapKey}>
        <span><i /> Reviewed profile</span>
        <small>Representative points · boundaries not shown</small>
        <a href={boundarySourceUrl} target="_blank" rel="noreferrer">Official source ↗</a>
      </div>
    </div>
  );
}

export function HomeViewExperience({
  boundarySourceUrl,
  candidates,
  constituencies,
  monitorSnapshot,
  updates,
}: {
  boundarySourceUrl: string;
  candidates: readonly HomeCandidate[];
  constituencies: readonly HomeConstituency[];
  monitorSnapshot: PublicMonitorSnapshot | null;
  updates: readonly HomeUpdate[];
}) {
  const view = useSyncExternalStore(subscribeToHomeView, getHomeViewSnapshot, () => "atlas");
  const { selectedConstituencyId, setSelectedConstituencyId } = useCivicPreferences();

  const selectView = (nextView: HomeView) => {
    saveHomeView(nextView);
  };

  const selected = constituencies.find((constituency) => constituency.id === selectedConstituencyId) ?? null;
  const selectedCandidates = candidates
    .filter((candidate) => candidate.constituencyId === selected?.id)
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-GB"));
  const localUpdates = selected
    ? updates
        .filter((update) => update.constituencyIds.includes(selected.id))
        .toSorted(byNewest)
    : [];
  const islandWideUpdates = updates
    .filter((update) => update.constituencyIds.length === 0)
    .toSorted(byNewest);
  const otherUpdates = selected
    ? updates
        .filter(
          (update) => update.constituencyIds.length > 0 && !update.constituencyIds.includes(selected.id),
        )
        .toSorted(byNewest)
    : updates.filter((update) => update.constituencyIds.length > 0).toSorted(byNewest);
  const deskUpdates = selected
    ? [...localUpdates, ...islandWideUpdates, ...otherUpdates]
    : updates.toSorted(byNewest);

  return (
    <section className={styles.experience} id="constituencies">
      <div className={styles.switchBar}>
        <div className={styles.switchInner}>
          <div className={`${styles.viewSwitch} ${view === "desk" ? styles.viewSwitchDesk : ""}`} role="group" aria-label="Choose homepage view">
            <span className={styles.switchThumb} aria-hidden="true" />
            <button
              aria-pressed={view === "atlas"}
              id="living-atlas-tab"
              onClick={() => selectView("atlas")}
              type="button"
            >
              <strong>Living Atlas</strong>
              <small>Explore by place</small>
            </button>
            <button
              aria-pressed={view === "desk"}
              id="election-desk-tab"
              onClick={() => selectView("desk")}
              type="button"
            >
              <strong>Election Desk</strong>
              <small>Explore by update</small>
            </button>
          </div>

          <div className={selected ? styles.savedRegion : styles.savedRegionEmpty} aria-live="polite">
            <span>{selected ? "Area of interest" : "No area selected"}</span>
            <strong>{selected?.name ?? "Choose on the map"}</strong>
            {selected ? (
              <button onClick={() => setSelectedConstituencyId(null)} type="button">Clear</button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.experienceGrid}>
        <div className={styles.experienceMain}>
          {view === "atlas" ? (
            <div
              aria-labelledby="living-atlas-tab"
              className={styles.atlasView}
              id="living-atlas-view"
              key="atlas"
              role="region"
            >
              <CandidateAtlasMap
                boundarySourceUrl={boundarySourceUrl}
                candidates={candidates}
                constituencies={constituencies}
                onSelect={setSelectedConstituencyId}
                selectedId={selectedConstituencyId}
              />

              <div className={styles.atlasNews}>
            <div className={styles.sectionHeading}>
              <div>
                <span>Founder-curated launch briefing</span>
                <h2>{selected ? `For ${selected.name}` : "Across the Island"}</h2>
              </div>
              <a href="/latest">Election desk ↗</a>
            </div>
            {selected && !localUpdates.length ? (
              <div className={styles.emptyPanel}>
                <span aria-hidden="true">◇</span>
                <div>
                  <strong>No constituency-specific update has been reviewed yet</strong>
                  <p>Island-wide information remains visible, but it is never relabelled as local.</p>
                </div>
              </div>
            ) : (
              <UpdateCollection
                localArea={selected?.name ?? null}
                updates={(selected ? localUpdates : updates.toSorted(byNewest)).slice(0, 3)}
              />
            )}
            {selected && islandWideUpdates.length ? (
              <div className={styles.islandWideRibbon}>
                <span>Island-wide</span>
                <strong>{islandWideUpdates[0].title}</strong>
                <a href={islandWideUpdates[0].url} target="_blank" rel="noreferrer">Source ↗</a>
              </div>
            ) : null}
              </div>
            </div>
          ) : (
            <div
              aria-labelledby="election-desk-tab"
              className={styles.deskView}
              id="election-desk-view"
              key="desk"
              role="region"
            >
          <div className={styles.deskMasthead}>
            <div>
              <p>The Island Election Desk</p>
              <h1>What has changed?</h1>
              <span>Reviewed election information, organised around the place you care about.</span>
            </div>
            <div className={styles.deskStatus}>
              <span><i aria-hidden="true" /> Reviewed evidence only</span>
              <strong>Every summary opens to its original source</strong>
              <small>Collection remains separate; nothing publishes automatically</small>
            </div>
          </div>

          <div className={styles.deskLayout}>
            <aside>
              <RegionChooser
                compact
                constituencies={constituencies}
                onSelect={setSelectedConstituencyId}
                selectedId={selectedConstituencyId}
              />
              <div className={styles.issueLinks}>
                <span>Follow the defining questions</span>
                <a href="#issues">Manx Care <b>→</b></a>
                <a href="#issues">Wind energy <b>→</b></a>
                <a href="#issues">Housing <b>→</b></a>
              </div>
            </aside>

            <div className={styles.deskMain}>
              <div className={styles.deskHeading}>
                <div>
                  <span>{selected ? `Prioritising ${selected.name}` : "All reviewed updates"}</span>
                  <h2>{selected && localUpdates.length ? "Your area comes first" : "The reviewed briefing"}</h2>
                </div>
                <a href="/latest">Full election desk ↗</a>
              </div>
              {selected && !localUpdates.length ? (
                <div className={styles.noLocalDeskUpdate}>
                  <strong>No reviewed {selected.name} update yet.</strong>
                  <span>Showing Island-wide and other constituency updates below, with their scope kept explicit.</span>
                </div>
              ) : null}
              <div className={styles.deskFeed}>
                {deskUpdates.slice(0, 4).map((update, index) => {
                  const isLocal = Boolean(selected && update.constituencyIds.includes(selected.id));
                  const isIslandWide = update.constituencyIds.length === 0;
                  return (
                    <article key={update.url}>
                      <span className={styles.deskIndex}>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <div className={styles.deskMeta}>
                          <span>{update.dateQualifier} {update.date} · {update.source}</span>
                          <strong className={isLocal ? styles.scopeLocal : undefined}>
                            {isLocal ? "Your area" : isIslandWide ? "Island-wide" : "Elsewhere"}
                          </strong>
                        </div>
                        <h3>{update.title}</h3>
                        <p>{update.summary}</p>
                        <a href={update.url} target="_blank" rel="noreferrer">Open source ↗</a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

              <div className={styles.deskCandidates}>
            <div className={styles.sectionHeading}>
              <div>
                <span>Reviewed candidate profiles</span>
                <h2>{selected ? `Standing in ${selected.name}` : "Choose an area to prioritise its candidates"}</h2>
              </div>
              <p>Candidate order is alphabetical, never based on popularity or editorial preference.</p>
            </div>
            {selected ? (
              <CandidateCollection candidates={selectedCandidates} emptyArea={selected.name} />
            ) : (
              <div className={styles.emptyPrompt}>
                <strong>No constituency selected</strong>
                <p>Choose one above. The preference will also be used on the full Election Desk.</p>
              </div>
            )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.monitorColumn}>
          <PublicMonitorPanel initialSnapshot={monitorSnapshot} />
        </div>
      </div>
    </section>
  );
}
