"use client";

import { Icon } from "@/components/Icon";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  btnPrimary,
  btnSecondary,
  cameraBandCorner,
  cameraBandCornerEdge,
  cameraBusyRing,
  cameraBusyRingEdge,
  cameraToggle,
  cameraVideo,
  cameraView,
  sheetActionsSingle,
} from "@/components/ui/styles";
import { barcodeOf } from "@/lib/barcode";
import type { BarcodeFormat } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";
import { useCameraStream, type CameraStatus } from "./scanner/useCameraStream";

// ---------------------------------------------------------------------------
// ScannerSheet: the camera, stacked on the log sheet (`FoodSheetStack`),
// opened from the camera button in its search field. Titled "Scan a
// barcode": the live view at the body's width and 4:3, the band the decoder
// reads marked by four corners, a line under it that says what is
// happening, and **Type the number** alone in the footer, where focus starts.
//
// Nothing in the sheet changes size from one state to the next, so its top
// edge, the picture and the footer stay where they opened, however fast the
// camera answers. The picture's box is fixed at 4:3. What a state adds sits
// inside it: **Try again** in place of the picture while the camera is busy,
// and **Torch** over the picture where the camera has a light. The line
// keeps the height of the longest line any state shows, at the width it has.
//
// A read is a decoded code the search field would take as typed
// (`barcodeOf`). Anything else, such as one of fewer than 8 or more than 14
// digits, is no read: nothing happens and the scanner keeps looking. An
// add-on never arrives glued to a code, because the decoder leaves it out. A
// read buzzes where the device can, then hands the code and its format to
// `onRead`, and the host closes the sheet. The camera stops on every way out
// (`useCameraStream`).
//
// Nothing is typed in the sheet, so it is always dismissible: a swipe, a tap
// above it or Escape closes it and stops the camera. From `md` it is the
// centred dialog, as wide as the log sheet under it.
// ---------------------------------------------------------------------------

export interface ScannerSheetProps {
  open: boolean;
  onClose: () => void;
  /** The camera button that opened it, where focus goes on a swipe, a tap outside or Escape. */
  returnFocusTo: HTMLElement | null;
  /** False when the host places focus itself, after a read or **Type the number**. */
  restoreFocusOnClose: boolean;
  /** A read: the code as the search field takes it, and the format the lookup takes, if any. */
  onRead: (code: string, format: BarcodeFormat | undefined) => void;
  /** **Type the number**: the host closes the sheet and puts focus in the search field. */
  onTypeNumber: () => void;
}

/** The four corners of the band: the top-left corner, placed and turned. */
const CORNERS = [
  "top-0 left-0",
  "top-0 right-0 rotate-90",
  "right-0 bottom-0 rotate-180",
  "bottom-0 left-0 -rotate-90",
];

/** The device buzzes briefly on a read, where it can. iOS cannot. */
function buzz(): void {
  if (typeof navigator.vibrate === "function") navigator.vibrate(30);
}

export function ScannerSheet({
  open,
  onClose,
  returnFocusTo,
  restoreFocusOnClose,
  onRead,
  onTypeNumber,
}: ScannerSheetProps): ReactElement {
  const t = useTranslations("foods.scan");
  const tSheet = useTranslations("foods.sheet");
  const typeRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const camera = useCameraStream({
    active: open,
    onDecoded: ({ text, format }) => {
      const code = barcodeOf(text);
      // No barcode the field would take: no read, and the scanner keeps looking.
      if (code === null) return false;
      buzz();
      onRead(code, format);
      return true;
    },
  });
  const { status } = camera;
  /**
   * The line under the picture in each state. Only `busy` offers Try again. A scanner that did not load offers
   * Type the number alone, on purpose: the usual cause is the network, and typing needs none.
   */
  const lines: Record<CameraStatus, string> = {
    starting: t("starting"),
    scanning: t("aim"),
    refused: t("refused"),
    no_camera: t("noCamera"),
    busy: t("busy"),
    no_decoder: t("noDecoder"),
  };

  // Focus that lands on the sheet itself, as the second tap of a double tap on the camera button does
  // when it meets the sheet sliding in, goes on to Type the number, where it starts.
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (event: FocusEvent): void => {
      const popup = viewRef.current?.closest("[role='dialog']");
      if (popup && event.target === popup) typeRef.current?.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      returnFocusTo={returnFocusTo}
      restoreFocusOnClose={restoreFocusOnClose}
      panelClassName="md:max-w-lg"
      footer={
        <div className={sheetActionsSingle}>
          <button
            ref={typeRef}
            type="button"
            // Focus starts here: the one action every state has.
            autoFocus
            onClick={onTypeNumber}
            className={btnSecondary}
          >
            {t("typeNumber")}
          </button>
        </div>
      }
    >
      <div ref={viewRef} data-scanner-view={status} className={cameraView}>
        <video
          ref={camera.videoRef}
          aria-hidden="true"
          playsInline
          muted
          autoPlay
          // The crop the decoder maps the band through (`cameraVideo`).
          className={cameraVideo}
        />
        {/* Always laid out, so the decoder can read its box: what it covers is what is decoded. */}
        <div
          ref={camera.bandRef}
          aria-hidden="true"
          data-scanner-band=""
          className="pointer-events-none absolute inset-x-5 top-1/4 bottom-1/4"
        >
          {status === "scanning" &&
            CORNERS.map((place) => (
              <span key={place} data-band-corner="" className={`${cameraBandCorner} ${place}`}>
                <span className={cameraBandCornerEdge} />
              </span>
            ))}
        </div>
        {status === "scanning" ? (
          camera.light !== null && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center">
              <button type="button" aria-pressed={camera.light} onClick={camera.toggleLight} className={cameraToggle}>
                <Icon name="bolt" filled={camera.light} className="size-5" />
                {t("torch")}
              </button>
            </div>
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-muted">
            {status === "starting" ? (
              <span aria-hidden="true" data-scanner-ring="" className={cameraBusyRing}>
                <span className={cameraBusyRingEdge} />
              </span>
            ) : (
              <Icon name="camera" className="size-10" />
            )}
            {status === "busy" && (
              <button
                type="button"
                onClick={() => {
                  // The button goes as the camera starts again, so focus moves on first.
                  typeRef.current?.focus();
                  camera.retry();
                }}
                className={btnPrimary}
              >
                {tSheet("tryAgain")}
              </button>
            )}
          </div>
        )}
      </div>
      {/* The line, over every line a state can show, laid in one cell: the cell keeps the tallest one's height. */}
      <div className="mt-4 grid text-base break-words text-ink">
        <p aria-live="polite" data-scanner-line="" className="col-start-1 row-start-1">
          {lines[status]}
        </p>
        <div aria-hidden="true" data-scanner-line-room="" className="invisible col-start-1 row-start-1 grid">
          {Object.entries(lines).map(([state, line]) => (
            <span key={state} className="col-start-1 row-start-1">
              {line}
            </span>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
