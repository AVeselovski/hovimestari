"use client";

import { toastAction, toastRoot, toastTitle, toastViewport } from "@/components/ui/styles";
import { Toast } from "@base-ui/react/toast";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";

// ---------------------------------------------------------------------------
// Toast: the one place a short outcome shows on the page, such as "Removed
// Rahka." with Undo. Base UI's Toast, wrapped once here and mounted once by
// AppShell.
//
// - One at a time. `show()` closes the toast on screen before it adds the
//   next, so no older toast stays reachable: Base UI's own `limit` would keep
//   older toasts in the DOM, where a screen reader still reaches an old Undo.
//   A closing toast fades out where it is. While it does it is hidden from
//   assistive tech (`aria-hidden`), out of the Tab order, and it still
//   catches every press on it and drops it. `inert` would let a press fall
//   through to whatever lies under it: a double tap on Undo opened the entry
//   sheet of the row below.
// - Closing toasts are drawn before the live one. They share one place and
//   no z-index, so the later in the document paints on top, and a press on
//   the new toast's Undo during the old one's fade reaches the new toast.
// - 6 seconds, paused while pointed at or focused, swiped down to dismiss,
//   announced politely. It never takes focus, and F6 reaches it.
// - An action closes the toast on its press, before it runs, so it cannot be
//   sent twice. A second press on the same toast does nothing.
// - A pointer press on an action takes no focus, so focus stays where it was.
//   A press from the keyboard runs the action first, which may move focus
//   where its result shows. If focus is still in the toast then, it goes back
//   to where it was before it entered the toast region, before the toast is
//   hidden, so focus is never inside a hidden toast.
// - It sits under every sheet (`zToast`). A sheet shows its own outcomes
//   inside itself.
// ---------------------------------------------------------------------------

/** How long a toast stays, unless pointed at or focused. */
export const TOAST_TIMEOUT_MS = 6000;

/** How an action was pressed. */
export interface ToastPress {
  /** Enter or Space, not a pointer: the caller may move focus where the action's result shows. */
  fromKeyboard: boolean;
}

export interface ToastAction {
  label: string;
  onPress: (press: ToastPress) => void;
}

export interface ToastMessage {
  message: string;
  action?: ToastAction;
}

export interface ToastApi {
  /** Closes the toast on screen, then shows this one. */
  show: (toast: ToastMessage) => void;
}

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  return <Toast.Provider timeout={TOAST_TIMEOUT_MS}>{children}</Toast.Provider>;
}

/** Every toast's id, counted across every `useToast`, so two callers never share one. */
let toastCount = 0;

/** Where focus was before it entered the toast region, for a keyboard press that leaves focus in a closing toast. */
let focusBeforeToasts: HTMLElement | null = null;

/** Moves focus out of `root` before it is hidden: back to where it came from, or off the page's controls. */
function leaveToast(root: Element | null): void {
  const active = document.activeElement;
  if (!root || !(active instanceof HTMLElement) || !root.contains(active)) return;
  const back = focusBeforeToasts;
  if (back?.isConnected && !back.closest("[data-toast]")) back.focus({ preventScroll: true });
  if (root.contains(document.activeElement)) active.blur();
}

/** A pointer press on a toast's action keeps focus where it is. The click still fires, on touch and mouse. */
const keepFocus = (e: SyntheticEvent): void => e.preventDefault();

/** Shows a toast. Only one is ever on screen. */
export function useToast(): ToastApi {
  const manager = Toast.useToastManager();
  const managerRef = useRef(manager);
  managerRef.current = manager;

  const show = useCallback(({ message, action }: ToastMessage) => {
    const m = managerRef.current;
    m.close();
    toastCount += 1;
    const id = `toast-${toastCount}`;
    let pressed = false;
    m.add({
      id,
      title: message,
      actionProps: action
        ? {
            children: action.label,
            onPointerDown: keepFocus,
            onMouseDown: keepFocus,
            onClick: (e: MouseEvent<HTMLButtonElement>) => {
              if (pressed) return;
              pressed = true;
              // A click from Enter or Space has no pointer: its detail is 0.
              const fromKeyboard = e.detail === 0;
              const root = e.currentTarget.closest("[data-toast]");
              action.onPress({ fromKeyboard });
              // Before the toast is hidden, so focus never sits in a hidden subtree.
              if (fromKeyboard) leaveToast(root);
              managerRef.current.close(id);
            },
          }
        : undefined,
    });
  }, []);

  return useMemo(() => ({ show }), [show]);
}

/** Stop every press on a closing toast where it lands: no click reaches its action or anything under it, and no focus moves. */
const stop = (e: SyntheticEvent): void => {
  e.preventDefault();
  e.stopPropagation();
};
const swallow = {
  onPointerDownCapture: stop,
  onMouseDownCapture: stop,
  onClickCapture: stop,
  onTouchEndCapture: stop,
};

/** The toasts' one region. Rendered once, by AppShell. */
export function ToastRegion(): ReactElement {
  const t = useTranslations("toast");
  const { toasts } = Toast.useToastManager();
  // Closing toasts first, so the live one paints over them. A toast is closed
  // before the next is added, so this keeps every node where it already is.
  const ordered = [
    ...toasts.filter((x) => x.transitionStatus === "ending"),
    ...toasts.filter((x) => x.transitionStatus !== "ending"),
  ];
  return (
    <Toast.Portal>
      <Toast.Viewport
        aria-label={t("region")}
        // An open sheet leaves Tab in here to Base UI (lib/sheetTab.ts).
        data-toast-region=""
        className={toastViewport}
        onFocus={(e) => {
          const from = e.relatedTarget;
          if (from instanceof HTMLElement && !e.currentTarget.contains(from)) focusBeforeToasts = from;
        }}
      >
        {ordered.map((toast) => {
          const ending = toast.transitionStatus === "ending";
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              swipeDirection="down"
              aria-hidden={ending || undefined}
              data-toast=""
              data-ending={ending || undefined}
              {...(ending ? swallow : {})}
              className={toastRoot}
            >
              <Toast.Title className={toastTitle} />
              {toast.actionProps && <Toast.Action tabIndex={ending ? -1 : undefined} className={toastAction} />}
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
