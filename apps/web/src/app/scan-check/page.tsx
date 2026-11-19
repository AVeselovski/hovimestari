"use client";

// A throwaway page on the branch spike/scan-check, which never merges. It
// proves on a real phone that the camera and the barcode decoder work, before
// the real scanner is built. Its strings are not in the message catalog: the
// eslint override for this folder says why. docs/design/scan-check.md says how
// to run it.

import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { loadDecoder, type LoadedDecoder } from "./decoder";
import { clockTime, isNewRead, logAsText, middleBand, type LastRead, type LogLine } from "./scanCheckLib";

const DECODE_EVERY_MS = 150;

type StopReason =
  | "the Stop camera button"
  | "visibilitychange to hidden"
  | "pagehide"
  | "the track's own ended event"
  | "leaving the page";

interface Session {
  id: number;
  stream: MediaStream | null;
  startedAt: number;
  lastReadAt: number | null;
  lastRead: LastRead | null;
  timer: number | null;
  rateTimer: number | null;
  tried: number;
  decodeMs: number;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export default function ScanCheckPage(): ReactElement {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [rateLine, setRateLine] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextId = useRef(0);
  const sessionCounter = useRef(0);
  const session = useRef<Session | null>(null);
  const linesRef = useRef<LogLine[]>([]);
  const rateRef = useRef<string | null>(null);

  const log = useCallback((text: string): void => {
    nextId.current += 1;
    const line = { id: nextId.current, at: new Date(), text };
    linesRef.current = [line, ...linesRef.current];
    setLines(linesRef.current);
  }, []);

  const setRate = useCallback((text: string | null): void => {
    rateRef.current = text;
    setRateLine(text);
  }, []);

  const stop = useCallback(
    (reason: StopReason): void => {
      const current = session.current;
      if (!current) return;
      session.current = null;
      sessionCounter.current += 1;
      if (current.timer !== null) window.clearTimeout(current.timer);
      if (current.rateTimer !== null) window.clearInterval(current.rateTimer);
      const tracks = current.stream?.getTracks() ?? [];
      for (const track of tracks) track.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
      const states = tracks.map((track) => `${track.kind} ${track.readyState}`).join(", ") || "no tracks yet";
      log(`Stream stopped by ${reason}. Stopped ${tracks.length} track(s): ${states}.`);
      if (rateRef.current) log(`Last rate: ${rateRef.current}`);
      setRate(null);
      setRunning(false);
    },
    [log, setRate],
  );

  const decodeLoop = useCallback(
    (decoder: LoadedDecoder, id: number): void => {
      const tick = async (): Promise<void> => {
        const current = session.current;
        const video = videoRef.current;
        if (!current || current.id !== id || !video) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const band = middleBand(video.videoWidth, video.videoHeight);
          canvasRef.current ??= document.createElement("canvas");
          const canvas = canvasRef.current;
          canvas.width = band.dw;
          canvas.height = band.dh;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(video, band.sx, band.sy, band.sw, band.sh, 0, 0, band.dw, band.dh);
            const image = context.getImageData(0, 0, band.dw, band.dh);
            const before = performance.now();
            const results = await decoder.read(image);
            const after = performance.now();
            if (session.current?.id !== id) return;
            current.tried += 1;
            current.decodeMs += after - before;
            const result = results[0];
            if (result && isNewRead(current.lastRead, result.text, after)) {
              const sinceStart = Math.round(after - current.startedAt);
              const sincePrevious =
                current.lastReadAt === null
                  ? "first read"
                  : `${Math.round(after - current.lastReadAt)} ms since the previous read`;
              log(
                `Read ${result.text} (${result.format}), ${sinceStart} ms since the camera started, ${sincePrevious}, frame ${band.dw}x${band.dh} from ${video.videoWidth}x${video.videoHeight}.`,
              );
              current.lastReadAt = after;
            }
            if (result) current.lastRead = { text: result.text, at: after };
          }
        }
        if (session.current?.id === id) current.timer = window.setTimeout(() => void tick(), DECODE_EVERY_MS);
      };
      void tick();
    },
    [log],
  );

  const start = useCallback(async (): Promise<void> => {
    if (session.current) return;
    sessionCounter.current += 1;
    const id = sessionCounter.current;
    const current: Session = {
      id,
      stream: null,
      startedAt: performance.now(),
      lastReadAt: null,
      lastRead: null,
      timer: null,
      rateTimer: null,
      tried: 0,
      decodeMs: 0,
    };
    session.current = current;
    setRunning(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      log("Cannot start: navigator.mediaDevices.getUserMedia is missing. The page needs https.");
      session.current = null;
      setRunning(false);
      return;
    }

    log("Decoder loading.");
    const decoderPromise = loadDecoder().then(
      (decoder) => {
        log(`Decoder loaded in ${decoder.ms} ms. zxing-wasm ${decoder.version}, wasm from ${decoder.wasmUrl}`);
        const entry = performance.getEntriesByName(new URL(decoder.wasmUrl, location.href).href)[0] as
          PerformanceResourceTiming | undefined;
        if (entry)
          log(
            `Wasm fetch: ${Math.round(entry.duration)} ms, ${entry.transferSize} bytes over the network, ${entry.decodedBodySize} bytes decoded.`,
          );
        return decoder;
      },
      (error: unknown) => {
        log(`Decoder failed to load. ${describeError(error)}`);
        return null;
      },
    );

    log("getUserMedia asked: rear camera, no audio, ideal 1280x720.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (error) {
      log(`getUserMedia refused. ${describeError(error)}`);
      if (session.current?.id === id) {
        session.current = null;
        setRunning(false);
      }
      return;
    }
    if (session.current?.id !== id) {
      for (const track of stream.getTracks()) track.stop();
      log(
        `getUserMedia resolved after the stream was stopped. Stopped its ${stream.getTracks().length} track(s) at once.`,
      );
      return;
    }
    current.stream = stream;
    current.startedAt = performance.now();
    const [track] = stream.getVideoTracks();
    if (track) {
      const s = track.getSettings();
      log(
        `getUserMedia granted: "${track.label}", ${s.width}x${s.height}, facingMode ${s.facingMode ?? "not reported"}, ${s.frameRate ?? "?"} fps.`,
      );
      track.addEventListener("ended", () => {
        if (session.current?.id === id) stop("the track's own ended event");
      });
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.play().catch((error: unknown) => log(`video.play() failed. ${describeError(error)}`));
    }

    current.rateTimer = window.setInterval(() => {
      const perDecode = current.tried > 0 ? (current.decodeMs / current.tried).toFixed(1) : "-";
      setRate(`Decode loop: ${current.tried} frames tried in the last second, ${perDecode} ms per decode on average.`);
      current.tried = 0;
      current.decodeMs = 0;
    }, 1000);

    const decoder = await decoderPromise;
    if (decoder && session.current?.id === id) decodeLoop(decoder, id);
  }, [decodeLoop, log, setRate, stop]);

  useEffect(() => {
    log(`Secure context: ${window.isSecureContext ? "yes" : "no"}.`);
    log(`navigator.mediaDevices: ${navigator.mediaDevices ? "present" : "missing"}.`);
    log(`Running as: ${isStandalone() ? "installed app (standalone)" : "browser tab"}.`);
    log(`User agent: ${navigator.userAgent}`);
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") stop("visibilitychange to hidden");
    };
    const onPageHide = (): void => stop("pagehide");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      stop("leaving the page");
    };
  }, [log, stop]);

  const copyLog = useCallback(async (): Promise<void> => {
    const text = logAsText(linesRef.current, rateRef.current);
    try {
      await navigator.clipboard.writeText(text);
      log(`Log copied (${text.length} characters).`);
    } catch (error) {
      log(`Copy failed. ${describeError(error)}`);
    }
  }, [log]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 bg-bg px-4 pt-4 pb-8 text-ink">
      <h1 className="font-display text-3xl font-semibold">Scan check</h1>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btnPrimary} onClick={() => void start()} disabled={running}>
          Start camera
        </button>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => stop("the Stop camera button")}
          disabled={!running}
        >
          Stop camera
        </button>
      </div>
      <div className="relative min-h-40 w-full overflow-hidden rounded-card border border-rule bg-surface">
        <video ref={videoRef} playsInline muted autoPlay className="block h-auto w-full" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-x-0 top-1/4 h-1/2 border-y-2 border-accent"
          aria-hidden="true"
        />
      </div>
      <button type="button" className={btnSecondary} onClick={() => void copyLog()}>
        Copy log
      </button>
      <section aria-label="Log" className="flex flex-col gap-1 font-mono text-sm leading-snug break-words">
        {rateLine ? <p className="rounded-control bg-surface px-2 py-1">{rateLine}</p> : null}
        {lines.map((line) => (
          <p key={line.id}>
            <span className="text-ink-muted">{clockTime(line.at)}</span> {line.text}
          </p>
        ))}
      </section>
    </main>
  );
}
