import type { Metadata } from "next";
import { Header } from "../../components/Header";
import { ResearchOperationsDashboard } from "../../components/ResearchOperationsDashboard";
import { getAdminAccess } from "../../lib/admin-auth";
import { getEvidenceDashboardSafe } from "../../lib/evidence/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research operations",
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
            You are signed in, but this Site-specific account has not been added to
            The People’s Isle administrator allowlist.
          </p>
          <div className="admin-identity-card">
            <span>{access.configured ? "Access not granted" : "First-admin setup required"}</span>
            <strong>{access.user.displayName}</strong>
            <small>{access.user.email}</small>
            <code>{access.user.userId}</code>
          </div>
          <p className="admin-access-note">
            Add this user ID to <code>ADMIN_USER_IDS</code> or the signed-in email to{" "}
            <code>ADMIN_EMAILS</code>. No unpublished evidence has been loaded on this page.
          </p>
        </section>
      </main>
    );
  }
  const dashboard = await getEvidenceDashboardSafe();
  return (
    <main className="admin-page">
      <Header />
      <ResearchOperationsDashboard
        dashboard={dashboard}
        reviewerName={access.user.displayName}
      />
    </main>
  );
}
