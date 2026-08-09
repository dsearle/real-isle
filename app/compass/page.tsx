import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { VoteCompass } from "../components/VoteCompass";

export const metadata: Metadata = {
  title: "Private vote compass",
  description: "Explore your priorities for the 2026 House of Keys election without sending your answers to Real Isle.",
};

export default function CompassPage() {
  return (
    <main className="compass-page">
      <Header />
      <section className="compass-hero shell">
        <div>
          <p className="eyebrow">Private vote compass · methodology preview</p>
          <h1>What do you want the next Keys to change?</h1>
        </div>
        <div className="privacy-seal">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Local-only answers</strong>
            <small>Nothing is sent to Real Isle</small>
          </div>
        </div>
      </section>
      <VoteCompass />
      <Footer />
    </main>
  );
}
