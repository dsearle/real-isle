import type { Metadata } from "next";
import { Header } from "../../components/Header";
import { EvidenceMonitorPanel } from "../../components/EvidenceMonitorPanel";
import { ReviewQueue } from "../../components/ReviewQueue";
import { getAdminAccess } from "../../lib/admin-auth";
import { getEvidenceDashboardSafe } from "../../lib/evidence/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founder review prototype",
  robots: { index: false, follow: false },
};

export default async function ReviewPage() {
  const access = await getAdminAccess("/admin/review");
  if (!access.allowed) {
    return (
      <main className="admin-page">
        <Header />
        <section className="admin-shell admin-access-shell">
          <p className="eyebrow eyebrow-dark">Founder workspace · protected</p>
          <h1>Admin access is locked</h1>
          <p>
            You are signed in, but this Site-specific account has not been added to the
            Real Isle administrator allowlist.
          </p>
          <div className="admin-identity-card">
            <span>{access.configured ? "Access not granted" : "First-admin setup required"}</span>
            <strong>{access.user.displayName}</strong>
            <small>{access.user.email}</small>
            <code>{access.user.userId}</code>
          </div>
          <p className="admin-access-note">
            Add this user ID to the private <code>ADMIN_USER_IDS</code> runtime variable. No
            unpublished evidence has been loaded on this page.
          </p>
        </section>
      </main>
    );
  }
  const dashboard = await getEvidenceDashboardSafe();
  return (
    <main className="admin-page">
      <Header />
      <section className="admin-shell">
        <div className="admin-heading">
          <div>
            <p className="eyebrow eyebrow-dark">Founder workspace · protected preview</p>
            <h1>Evidence review</h1>
            <p>Automated pulls remain private. Every publication decision must point to a captured source and an immutable review event.</p>
          </div>
          <div className="reviewer-chip">
            <span>DS</span>
            <div><strong>{access.user.displayName}</strong><small>Founder reviewer</small></div>
          </div>
        </div>
        <EvidenceMonitorPanel dashboard={dashboard} />
        <ReviewQueue />
      </section>
    </main>
  );
}
