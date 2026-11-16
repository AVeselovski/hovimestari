// Harnesses the BottomSheet suites share. Not a test file itself.

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet, type BottomSheetProps } from "../BottomSheet";

/**
 * A real trigger inside a `<main>` scroll container, like the app shell's
 * one scroll container (docs/app/mobile-responsive-shell.md). The sheet stays
 * mounted and is driven by `open`.
 */
export function Harness({
  initialOpen = false,
  onClose,
  children,
  ...props
}: Partial<Omit<BottomSheetProps, "open" | "children" | "title" | "ariaLabel">> & {
  initialOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <main data-testid="main" style={{ overflow: "auto" }}>
        <button type="button" onClick={() => setOpen(true)}>
          open
        </button>
      </main>
      <BottomSheet
        ariaLabel="Test sheet"
        {...props}
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        {children ?? (
          <>
            <button type="button">first</button>
            <button type="button">last</button>
          </>
        )}
      </BottomSheet>
    </>
  );
}

/** Base UI moves focus into the sheet a frame after it opens. */
export async function waitForFocusInside() {
  await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));
}

// A body that focuses itself on mount, as the transactions filter panel's
// `FilterFields` does so that opening does not pop its first combobox.
export function SelfFocusingBody() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} data-testid="self-focusing-body">
      <button type="button">a field</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A sheet stacked on another (docs/design/mobile-sheets-stage-4.md §j). The
// row sheet stays open while a picker or a prompt sits on it.
// ---------------------------------------------------------------------------

export interface StackHarnessProps {
  onParentClose?: () => void;
  onChildClose?: () => void;
  /** Where the stacked sheet returns focus: the control that opened it, unless `false`. */
  childReturnsToOpener?: boolean;
}

/**
 * A parent sheet with an "Add" control that opens a stacked sheet. The
 * stacked sheet can Fill (closes itself and turns the Add control into text
 * in the same update, as a quick-fill does) or Save (closes both in one
 * update, as a confirm does).
 */
export function StackHarness({ onParentClose, onChildClose, childReturnsToOpener = true }: StackHarnessProps) {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  const [filled, setFilled] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <>
      <main data-testid="main" style={{ overflow: "auto" }}>
        <button type="button" onClick={() => setParentOpen(true)}>
          open
        </button>
      </main>
      <BottomSheet
        ariaLabel="Parent sheet"
        open={parentOpen}
        onClose={() => {
          onParentClose?.();
          setParentOpen(false);
        }}
        stacked={
          <BottomSheet
            ariaLabel="Stacked sheet"
            open={childOpen}
            returnFocusTo={childReturnsToOpener ? opener : null}
            onClose={() => {
              onChildClose?.();
              setChildOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => {
                setChildOpen(false);
                setFilled(true);
              }}
            >
              Fill
            </button>
            <button
              type="button"
              onClick={() => {
                setChildOpen(false);
                setParentOpen(false);
              }}
            >
              Save
            </button>
          </BottomSheet>
        }
      >
        {filled ? (
          <p>Filled</p>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              setOpener(e.currentTarget);
              setChildOpen(true);
            }}
          >
            Add
          </button>
        )}
      </BottomSheet>
    </>
  );
}

export async function openStack(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "open" }));
  const parent = await screen.findByRole("dialog", { name: "Parent sheet" });
  await waitFor(() => expect(parent).toContainElement(document.activeElement as HTMLElement));
  await user.click(screen.getByRole("button", { name: "Add" }));
  const child = await screen.findByRole("dialog", { name: "Stacked sheet" });
  await waitFor(() => expect(child).toContainElement(document.activeElement as HTMLElement));
  return { parent, child };
}
