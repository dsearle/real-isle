import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Real Isle home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Real Isle</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/#constituencies">Constituencies</Link>
          <Link href="/#issues">Issues</Link>
          <Link href="/latest">Latest</Link>
          <Link className="nav-compass" href="/compass">Vote compass</Link>
        </nav>
        <Link className="review-link" href="/admin/review">
          Founder review
        </Link>
      </div>
    </header>
  );
}
