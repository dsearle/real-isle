import type { MachineAnalysisPublicView } from "../lib/evidence/machine-analysis-view";
import { MachineAnalysisDisclosure } from "./MachineAnalysisDisclosure";
import styles from "./MachineAnalysisFeed.module.css";

export type MachineAnalysisFeedState = "available" | "empty" | "unavailable";

export function MachineAnalysisFeed({
  analyses,
  compact = false,
  state,
}: {
  analyses: readonly MachineAnalysisPublicView[];
  compact?: boolean;
  state: MachineAnalysisFeedState;
}) {
  return (
    <section className={`${styles.feed} ${compact ? styles.compact : ""}`} aria-labelledby="machine-analysis-feed-heading">
      <header className={styles.header}>
        <div>
          <span>Automatic source reading</span>
          <h2 id="machine-analysis-feed-heading">Machine-analysed source extracts</h2>
        </div>
        <p>
          This is a separate lane from editor-reviewed evidence. Eligible extracts may publish automatically,
          with the exact source version and citation attached. They do not establish whether a source is true.
        </p>
      </header>

      <div className={styles.labelKey} aria-label="Analysis labels">
        <div><strong>Machine analysed</strong><span>Not checked by a person</span></div>
        <div><strong>Human verified</strong><span>Citation match checked by a reviewer</span></div>
      </div>

      {state === "unavailable" ? (
        <div className={styles.empty} role="status">
          <strong>Machine analysis is temporarily unavailable.</strong>
          <span>No unverified fallback or private capture has been shown.</span>
        </div>
      ) : analyses.length ? (
        <div className={styles.list}>
          {analyses.map((analysis) => (
            <MachineAnalysisDisclosure analysis={analysis} key={analysis.analysisId} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>No machine-analysed extract is public here yet.</strong>
          <span>Ambiguous, low-confidence or incompletely cited results remain private.</span>
        </div>
      )}
    </section>
  );
}
