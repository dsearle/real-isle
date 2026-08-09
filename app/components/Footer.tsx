import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <Link className="brand brand-footer" href="/">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>Real Isle</span>
          </Link>
          <p>Independent civic intelligence for the Isle of Man.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/#constituencies">Constituencies</Link>
          <Link href="/#issues">Big issues</Link>
          <Link href="/latest">Election desk</Link>
          <Link href="/compass">Vote compass</Link>
        </div>
        <div>
          <h2>Trust</h2>
          <a href="https://github.com/dsearle/real-isle/blob/main/docs/PROJECT_BRIEF.md" target="_blank" rel="noreferrer">Methodology ↗</a>
          <a href="https://github.com/dsearle/real-isle" target="_blank" rel="noreferrer">Open source ↗</a>
          <a href="mailto:editor@realisle.im">Corrections</a>
        </div>
        <div className="footer-note">
          <span>Founder-published</span>
          <p>
            Real Isle is initially founded, edited and reviewed by David Searle.
            It is not an official election authority.
          </p>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 David Searle · Apache-2.0 code</span>
        <span>Built in the Isle of Man, for the Island</span>
      </div>
    </footer>
  );
}
