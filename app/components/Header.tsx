/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's deployed client router currently throws on navigation; document links are intentional. */
export function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label="Real Isle home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Real Isle</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="/#constituencies">Constituencies</a>
          <a href="/#issues">Issues</a>
          <a href="/latest">Latest</a>
          <a className="nav-compass" href="/compass">Vote compass</a>
        </nav>
        <a className="review-link" href="/admin/review">
          Founder review
        </a>
      </div>
    </header>
  );
}
