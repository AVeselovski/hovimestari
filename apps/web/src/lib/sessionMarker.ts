// ---------------------------------------------------------------------------
// Whether this device has a known session: a plain flag in localStorage, set
// when a session starts or renews and cleared on sign-out and when the
// server ends the session. It holds no token and proves nothing to the
// server. It only decides what an offline launch shows: the app shell for a
// device that was signed in, the guest side for one that was not.
// ---------------------------------------------------------------------------

export const SESSION_MARKER_KEY = "hovi-signed-in";

export function hasKnownSession(): boolean {
  try {
    return window.localStorage.getItem(SESSION_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSession(known: boolean): void {
  try {
    if (known) window.localStorage.setItem(SESSION_MARKER_KEY, "1");
    else window.localStorage.removeItem(SESSION_MARKER_KEY);
  } catch {
    // Storage refused: an offline launch shows the guest side.
  }
}
