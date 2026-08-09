import type { Metadata } from "next";
import { Header } from "../../components/Header";
import { ReviewQueue } from "../../components/ReviewQueue";

export const metadata: Metadata = {
  title: "Founder review prototype",
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <main className="admin-page">
      <Header />
      <section className="admin-shell">
        <div className="admin-heading">
          <div>
            <p className="eyebrow eyebrow-dark">Founder workspace · local prototype</p>
            <h1>Evidence review</h1>
            <p>No action on this screen publishes data yet. Authentication and durable audit storage are the next platform stage.</p>
          </div>
          <div className="reviewer-chip">
            <span>DS</span>
            <div><strong>David Searle</strong><small>Founder reviewer</small></div>
          </div>
        </div>
        <ReviewQueue />
      </section>
    </main>
  );
}
