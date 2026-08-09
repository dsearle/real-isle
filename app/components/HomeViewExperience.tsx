"use client";

import { useSyncExternalStore } from "react";
import { useCivicPreferences } from "./CivicPreferences";
import { IslandTerrain } from "./IslandTerrain";
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
};

export type HomeCandidate = {
  constituencyId: string;
  evidenceCount: number;
  initials: string;
  name: string;
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
          <div className={styles.candidateAvatar} aria-label={`${candidate.name} portrait pending rights clearance`} role="img">
            <span>{candidate.initials}</span>
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

export function HomeViewExperience({
  candidates,
  constituencies,
  updates,
}: {
  candidates: readonly HomeCandidate[];
  constituencies: readonly HomeConstituency[];
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
              <span>A</span>
              <strong>Living Atlas</strong>
              <small>Explore by place</small>
            </button>
            <button
              aria-pressed={view === "desk"}
              id="election-desk-tab"
              onClick={() => selectView("desk")}
              type="button"
            >
              <span>B</span>
              <strong>Election Desk</strong>
              <small>Explore by update</small>
            </button>
          </div>

          <div className={selected ? styles.savedRegion : styles.savedRegionEmpty} aria-live="polite">
            <span>{selected ? "Area of interest" : "No area selected"}</span>
            <strong>{selected?.name ?? "Choose one below"}</strong>
            {selected ? (
              <button onClick={() => setSelectedConstituencyId(null)} type="button">Clear</button>
            ) : null}
          </div>
        </div>
      </div>

      {view === "atlas" ? (
        <div
          aria-labelledby="living-atlas-tab"
          className={styles.atlasView}
          id="living-atlas-view"
          key="atlas"
          role="region"
        >
          <div className={styles.atlasHero}>
            <div className={styles.atlasIntro}>
              <p>The Living Atlas</p>
              <h1>Your Isle,<br /><em>Your Future</em></h1>
              <span>
                Start with the Island. Choose an area, meet its prospective candidates and follow every reviewed update back to its source.
              </span>
              <div className={styles.heroLinks}>
                <a href="/compass">Try the private compass</a>
                <a href="/latest">Open all reviewed updates</a>
              </div>
            </div>
            <div className={styles.terrainFrame}>
              <div className={styles.terrainLabel}>
                <span>Actual elevation data</span>
                <strong>Drag the Island to explore</strong>
              </div>
              <IslandTerrain />
            </div>
          </div>

          <div className={styles.atlasPicker}>
            <RegionChooser
              constituencies={constituencies}
              onSelect={setSelectedConstituencyId}
              selectedId={selectedConstituencyId}
            />
          </div>

          <div className={styles.selectedArea}>
            <div className={styles.sectionHeading}>
              <div>
                <span>{selected ? "Your selected area" : "Begin with a place"}</span>
                <h2>{selected?.name ?? "Choose a constituency above"}</h2>
              </div>
              <p>
                {selected
                  ? "Reviewed profiles are shown equally and alphabetically."
                  : "Nothing is inferred from your device or location."}
              </p>
            </div>
            {selected ? (
              <CandidateCollection candidates={selectedCandidates} emptyArea={selected.name} />
            ) : (
              <div className={styles.emptyPrompt}>
                <strong>One choice changes the whole view</strong>
                <p>Your area will stay selected when you switch to the Election Desk or return later.</p>
              </div>
            )}
          </div>

          <div className={styles.atlasNews}>
            <div className={styles.sectionHeading}>
              <div>
                <span>Latest reviewed evidence</span>
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
              <small>Automated discoveries remain private until reviewed</small>
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
    </section>
  );
}
