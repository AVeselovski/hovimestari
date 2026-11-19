// ---------------------------------------------------------------------------
// Whether any component in a rendered tree still holds a string, in its
// props or its hook state. For a secret that must not outlive the screen
// that showed it (a connection key): leaving the DOM is not enough if a
// component keeps it in state. Walks React's current fiber tree from the
// container testing-library rendered into.
// ---------------------------------------------------------------------------

interface Fiber {
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedProps: unknown;
  memoizedState: unknown;
}

/** The current root fiber of what was rendered into `container`. */
function rootFiberOf(container: Element): Fiber {
  const key = Object.keys(container).find((k) => k.startsWith("__reactContainer$"));
  if (!key) throw new Error("Not a React root container");
  const root = (container as unknown as Record<string, { stateNode: { current: Fiber } }>)[key]!;
  return root.stateNode.current;
}

/** True when `value` holds `text`, looking through plain objects and arrays a few levels deep. */
function holds(value: unknown, text: string, depth: number, seen: WeakSet<object>): boolean {
  if (typeof value === "string") return value.includes(text);
  if (value === null || typeof value !== "object" || depth === 0) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const proto = Object.getPrototypeOf(value) as unknown;
  if (Array.isArray(value)) return value.some((v) => holds(v, text, depth - 1, seen));
  // Plain data only: DOM nodes, clients and class instances are not state that holds text.
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.entries(value).some(([k, v]) => k !== "_owner" && holds(v, text, depth - 1, seen));
}

/** Every hook's state of a function component: a linked list through `next`. */
function hookStates(state: unknown): unknown[] {
  const out: unknown[] = [];
  let hook = state as { memoizedState?: unknown; next?: unknown } | null;
  let guard = 0;
  while (hook && typeof hook === "object" && "next" in hook && guard++ < 200) {
    out.push(hook.memoizedState);
    hook = hook.next as typeof hook;
  }
  return out.length > 0 ? out : [state];
}

/** True when a component under `container` holds `text` in its props or state. */
export function reactTreeHolds(container: Element, text: string): boolean {
  const seen = new WeakSet<object>();
  const stack: Fiber[] = [rootFiberOf(container)];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    if (holds(fiber.memoizedProps, text, 6, seen)) return true;
    if (hookStates(fiber.memoizedState).some((s) => holds(s, text, 6, seen))) return true;
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  return false;
}
