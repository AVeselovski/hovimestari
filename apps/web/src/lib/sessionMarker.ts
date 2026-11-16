// ---------------------------------------------------------------------------
// Whether this device has a known session: a plain flag in localStorage, set
// when a session starts or renews and cleared on sign-out and when the
// server ends the session. It holds no token and proves nothing to the
// server. It only decides what an offline launch shows: the app shell for a
// device that was signed in, the guest side for one that was not.
//
// Beside it, the email address of that session, so Settings can say whose
// account this device was last signed in to while the server cannot be
// asked. It goes with the flag.
// ---------------------------------------------------------------------------

export const SESSION_MARKER_KEY = "hovi-signed-in";
export const LAST_EMAIL_KEY = "hovi-last-email";

export function hasKnownSession(): boolean {
  try {
    return window.localStorage.getItem(SESSION_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

/** The email address of the last known session on this device, while the flag is set. */
export function lastKnownEmail(): string | null {
  try {
    return hasKnownSession() ? window.localStorage.getItem(LAST_EMAIL_KEY) : null;
  } catch {
    return null;
  }
}

export function markSession(known: boolean, email?: string): void {
  try {
    if (known) {
      window.localStorage.setItem(SESSION_MARKER_KEY, "1");
      if (email) window.localStorage.setItem(LAST_EMAIL_KEY, email);
    } else {
      window.localStorage.removeItem(SESSION_MARKER_KEY);
      window.localStorage.removeItem(LAST_EMAIL_KEY);
    }
  } catch {
    // Storage refused: an offline launch shows the guest side.
  }
}
