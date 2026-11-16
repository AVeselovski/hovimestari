/**
 * True while focus is still inside `popup`, or has been dropped on <body>.
 * An overlay that restores focus on close does so only then, so a close
 * caused by an action that moved focus elsewhere leaves it where it went.
 */
export function focusIsInsideOrLost(popup: HTMLElement | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !!popup?.contains(active);
}
