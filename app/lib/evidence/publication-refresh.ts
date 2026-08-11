const PUBLICATION_HEAD = /^[0-9a-f]{32}$/;

export type PublicationRefreshState = {
  head: string | null;
  synchronized: boolean;
};

export function isPublicProjectionPath(pathname: string) {
  return pathname === "/"
    || pathname === "/latest"
    || pathname.startsWith("/candidates/");
}

export function isPublicPublicationHead(value: unknown): value is string {
  return typeof value === "string" && PUBLICATION_HEAD.test(value);
}

export function reconcilePublicPublicationHead(
  state: PublicationRefreshState,
  nextHead: string,
): PublicationRefreshState & { shouldRefresh: boolean } {
  if (!isPublicPublicationHead(nextHead)) {
    return { ...state, shouldRefresh: false };
  }
  return {
    head: nextHead,
    shouldRefresh: !state.synchronized || state.head !== nextHead,
    synchronized: true,
  };
}
