"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { loadDecoder, type Decode, type Decoded, type Frame } from "./decoder";

// ---------------------------------------------------------------------------
// useCameraStream: the scanner's camera and its decode loop, for as long as
// the scanner is open and the page is shown.
//
// A start asks for the rear camera and loads the decoder at the same time.
// Once both are ready the hook decodes the band the overlay marks, about
// every 150 ms: the part of the frame under the band element, found through
// the video's `object-fit: cover` crop, so a code the person cannot see is
// never read. Each decode's result goes to
// `onDecoded`, which answers whether it was a read. The first read wins: the
// camera stops at once and nothing more is decoded.
//
// Every way out stops the camera. Each start takes a new session number and
// every stop moves the number on. A stop stops every track of the stream and
// empties the video. The scanner stops when `active` turns false (the sheet
// starts to close), when the page is hidden, and on unmount. A
// `getUserMedia` that resolves after its session ended, such as after the
// person swiped the sheet away during the browser's prompt, stops every
// track of the stream it got and shows nothing. A decode in flight when its
// session ends, or after a read already won, is dropped. Shown again with
// the sheet open, the camera starts again.
//
// No frame leaves the device: a frame goes from the video to a canvas to the
// decoder, and only `onDecoded` hears what it held.
// ---------------------------------------------------------------------------

/** What the scanner shows. Each failure has its own line and actions in `ScannerSheet`. */
export type CameraStatus = "starting" | "scanning" | "refused" | "no_camera" | "busy" | "no_decoder";

/** How long the loop waits after one decode before it takes the next frame. */
export const DECODE_EVERY_MS = 150;

/** The rear camera, no sound, at a size that reads a barcode at a hand's width. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

/** `HTMLMediaElement.HAVE_CURRENT_DATA`: the video has a frame to draw. */
const HAVE_CURRENT_DATA = 2;

/** What a camera track may say it can do, beyond what the DOM types list. */
interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}

// The names that mean this page gets no camera, each shown as "no camera": NotFoundError (there is none),
// OverconstrainedError (none fits; every constraint here is `ideal`, so it should not fire), and NotSupportedError,
// TypeError and SecurityError (the browser will not give one to this page).
const NO_CAMERA_FOR_PAGE = ["NotFoundError", "OverconstrainedError", "NotSupportedError", "TypeError", "SecurityError"];

/** Which failure a rejected `getUserMedia` is. */
export function cameraFailure(error: unknown): CameraStatus {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError") return "refused";
  // NotSupportedError, TypeError and SecurityError: this browser cannot give a camera to this page, such as one
  // a page policy or an insecure page keeps from it. Settings cannot change that and another try cannot help.
  if (NO_CAMERA_FOR_PAGE.includes(name)) return "no_camera";
  // NotReadableError, AbortError and anything unnamed: the camera is there, and may work on another try.
  return "busy";
}

/** The part of a frame to decode, in the frame's pixels, and the size it is drawn at. */
export interface Band {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

/** A box on screen, in CSS pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The part of a `frameWidth` by `frameHeight` frame that shows under `band`,
 * for a video laid out in `view` with `object-fit: cover`: the frame is
 * scaled to cover the view and centred, so its overflow is cut off evenly on
 * the two sides that overflow. Only the band's part over the view counts,
 * and it is drawn at most `maxWidth` pixels wide. Null when nothing of the frame shows under the band.
 */
export function visibleBand(
  frameWidth: number,
  frameHeight: number,
  view: Box,
  band: Box,
  maxWidth = 960,
): Band | null {
  if (frameWidth <= 0 || frameHeight <= 0 || view.width <= 0 || view.height <= 0) return null;
  const scale = Math.max(view.width / frameWidth, view.height / frameHeight);
  const left = view.left + (view.width - frameWidth * scale) / 2;
  const top = view.top + (view.height - frameHeight * scale) / 2;
  // Only the part of the band over the picture: the frame beyond the view is cut off on screen.
  const bandLeft = Math.max(band.left, view.left);
  const bandTop = Math.max(band.top, view.top);
  const bandRight = Math.min(band.left + band.width, view.left + view.width);
  const bandBottom = Math.min(band.top + band.height, view.top + view.height);
  const x0 = Math.max(0, (bandLeft - left) / scale);
  const y0 = Math.max(0, (bandTop - top) / scale);
  const x1 = Math.min(frameWidth, (bandRight - left) / scale);
  const y1 = Math.min(frameHeight, (bandBottom - top) / scale);
  const sx = Math.round(x0);
  const sy = Math.round(y0);
  const sw = Math.round(x1) - sx;
  const sh = Math.round(y1) - sy;
  if (sw <= 0 || sh <= 0) return null;
  const down = sw > maxWidth ? maxWidth / sw : 1;
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * down)), dh: Math.max(1, Math.round(sh * down)) };
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

interface Session {
  stream: MediaStream | null;
  timer: number | undefined;
  canvas: HTMLCanvasElement | null;
}

/** What the band shows of the video's current frame, or null while there is no frame or no band on screen. */
function grab(video: HTMLVideoElement | null, bandEl: HTMLElement | null, session: Session): Frame | null {
  if (video === null || bandEl === null || video.readyState < HAVE_CURRENT_DATA || video.videoWidth === 0) return null;
  const band = visibleBand(video.videoWidth, video.videoHeight, boxOf(video), boxOf(bandEl));
  if (band === null) return null;
  session.canvas ??= document.createElement("canvas");
  const canvas = session.canvas;
  // Set only when it changes: setting a canvas's size clears and may reallocate it.
  if (canvas.width !== band.dw) canvas.width = band.dw;
  if (canvas.height !== band.dh) canvas.height = band.dh;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(video, band.sx, band.sy, band.sw, band.sh, 0, 0, band.dw, band.dh);
  return context.getImageData(0, 0, band.dw, band.dh);
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export interface CameraStreamOptions {
  /** The scanner is open. False stops the camera. */
  active: boolean;
  /** A frame held a code. Answers true when it was a read, which stops the camera. */
  onDecoded: (decoded: Decoded) => boolean;
}

export interface CameraStream {
  status: CameraStatus;
  /** The `<video>` the stream plays in. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The element that marks the band on the video: what it covers is what is decoded. */
  bandRef: RefObject<HTMLDivElement | null>;
  /** Whether the camera's light is on, or null where the camera has none. */
  light: boolean | null;
  /** Turns the light on when it is off, and off when it is on. */
  toggleLight: () => void;
  /** Starts the camera again, after it was busy. */
  retry: () => void;
}

export function useCameraStream({ active, onDecoded }: CameraStreamOptions): CameraStream {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [light, setLightState] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  // The session number: every start takes one, every stop moves it on.
  const sessions = useRef(0);
  const current = useRef<Session | null>(null);
  // The light asked for last, ahead of the camera's answer, so a second quick tap turns it back.
  const lightWanted = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  useLayoutEffect(() => {
    onDecodedRef.current = onDecoded;
  });

  const stop = useCallback((): void => {
    sessions.current += 1;
    const session = current.current;
    current.current = null;
    if (session === null) return;
    window.clearTimeout(session.timer);
    if (session.stream) stopTracks(session.stream);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback((): void => {
    stop();
    sessions.current += 1;
    const id = sessions.current;
    const session: Session = { stream: null, timer: undefined, canvas: null };
    current.current = session;
    const live = (): boolean => sessions.current === id;
    setStatus("starting");
    setLightState(null);
    lightWanted.current = false;

    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) {
      current.current = null;
      setStatus("no_camera");
      return;
    }
    const decoder = loadDecoder();
    // Read below, once the camera has answered. Until then a failure waits here.
    decoder.catch(() => undefined);

    void (async (): Promise<void> => {
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia(CAMERA_CONSTRAINTS);
      } catch (error) {
        if (!live()) return;
        current.current = null;
        setStatus(cameraFailure(error));
        return;
      }
      if (!live()) {
        // Its session ended while the browser asked: the stream is stopped and never shown.
        stopTracks(stream);
        return;
      }
      session.stream = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => undefined);
      }
      const [track] = stream.getVideoTracks();
      track?.addEventListener("ended", () => {
        // The camera went away under the stream, such as another app taking it.
        if (!live()) return;
        stop();
        setStatus("busy");
      });

      let decode: Decode;
      try {
        decode = await decoder;
      } catch {
        if (!live()) return;
        stop();
        setStatus("no_decoder");
        return;
      }
      if (!live()) return;

      const capabilities = track?.getCapabilities?.() as CameraCapabilities | undefined;
      if (track && capabilities?.focusMode?.includes("continuous")) {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      }
      setLightState(capabilities?.torch ? false : null);
      setStatus("scanning");

      const tick = async (): Promise<void> => {
        if (!live()) return;
        const frame = grab(videoRef.current, bandRef.current, session);
        if (frame !== null) {
          let decoded: Decoded | null = null;
          try {
            decoded = await decode(frame);
          } catch {
            decoded = null;
          }
          // Closed, hidden or read while it decoded: the result is dropped.
          if (!live()) return;
          if (decoded !== null && onDecodedRef.current(decoded)) {
            stop();
            return;
          }
        }
        if (live()) session.timer = window.setTimeout(() => void tick(), DECODE_EVERY_MS);
      };
      void tick();
    })();
  }, [stop]);

  useEffect(() => {
    // Stopped in the event itself, so the camera light goes off as the page goes. `status` is left as it was
    // while the page is hidden: nothing paints then, and `start()` sets it to "starting" on the way back.
    const onVisibility = (): void => {
      const isHidden = document.visibilityState === "hidden";
      if (isHidden) stop();
      setHidden(isHidden);
    };
    const onPageHide = (): void => {
      stop();
      setHidden(true);
    };
    const onPageShow = (): void => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [stop]);

  useEffect(() => {
    if (!active || hidden) return;
    start();
    return stop;
  }, [active, hidden, attempt, start, stop]);

  const toggleLight = useCallback((): void => {
    const track = current.current?.stream?.getVideoTracks()[0];
    if (!track) return;
    const id = sessions.current;
    const on = !lightWanted.current;
    lightWanted.current = on;
    track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).then(
      () => {
        // An answer for a camera that has stopped since says nothing about the one running now.
        if (sessions.current === id) setLightState(on);
      },
      () => {
        if (sessions.current === id) lightWanted.current = !on;
      },
    );
  }, []);

  const retry = useCallback((): void => setAttempt((n) => n + 1), []);

  return { status, videoRef, bandRef, light, toggleLight, retry };
}
