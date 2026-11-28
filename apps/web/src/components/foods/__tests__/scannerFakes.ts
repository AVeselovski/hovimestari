import { deferred } from "@/__tests__/helpers/queryClient";
import { loadDecoder, type Decoded } from "@/components/foods/scanner/decoder";

// What jsdom lacks for the scanner, stood in for the way a browser behaves:
//
// - A camera: `navigator.mediaDevices.getUserMedia`, which the test answers
//   with a stream, holds, or refuses with an error's name. Each stream has a
//   video track and a second track, so "every track stops" means every one.
//   A stopped track reads `ended`, and stop() fires no `ended` event, as in a
//   browser.
// - A video with a frame, and a canvas that hands back pixels and records
//   what part of the frame it was handed.
// - Layout: the boxes of the video and of the band over it, as a browser
//   lays them out in a 350 by 262.5 picture (a 390 pixel wide phone).
// - The decoder: jsdom cannot run the wasm on video frames, so each decode
//   answers what the test queued, or waits while the test holds it.
//   decoder.test.ts decodes real images with the real library.
//
// A suite mocks the decoder module with
// `jest.mock("@/components/foods/scanner/decoder", () => ({ loadDecoder: jest.fn() }))`
// and calls `installCamera()` in `beforeEach` and its result in `afterEach`.

export interface FakeTrack {
  kind: string;
  readyState: MediaStreamTrackState;
  stop: jest.Mock;
  applyConstraints: jest.Mock;
  getCapabilities: () => Record<string, unknown>;
  addEventListener: (type: string, listener: () => void) => void;
  /** Fires `ended` as when the camera goes away under the stream. */
  end: () => void;
}

export interface FakeStream {
  tracks: FakeTrack[];
  getTracks: () => FakeTrack[];
  getVideoTracks: () => FakeTrack[];
}

function fakeTrack(kind: string, capabilities: Record<string, unknown>): FakeTrack {
  const ended: Array<() => void> = [];
  const track: FakeTrack = {
    kind,
    readyState: "live",
    stop: jest.fn(() => {
      track.readyState = "ended";
    }),
    applyConstraints: jest.fn().mockResolvedValue(undefined),
    getCapabilities: () => capabilities,
    addEventListener: (type, listener) => {
      if (type === "ended") ended.push(listener);
    },
    end: () => {
      track.readyState = "ended";
      for (const listener of ended) listener();
    },
  };
  return track;
}

export function fakeStream(capabilities: Record<string, unknown> = {}): FakeStream {
  const tracks = [fakeTrack("video", capabilities), fakeTrack("audio", {})];
  return { tracks, getTracks: () => tracks, getVideoTracks: () => tracks.filter((t) => t.kind === "video") };
}

/** A DOMException-like refusal, by its name. */
export function cameraError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

export interface FakeCamera {
  getUserMedia: jest.Mock;
  /** Every stream handed out, in order. */
  streams: FakeStream[];
  /** The next `getUserMedia` waits until the test settles it. */
  hold: () => { grant: (capabilities?: Record<string, unknown>) => FakeStream; refuse: (name: string) => void };
  /** The next `getUserMedia` fails with `name`. */
  refuseNext: (name: string) => void;
  /** Capabilities of the streams granted from now on, such as `{ torch: true }`. */
  capabilities: Record<string, unknown>;
  /** Decodes answer these, one per decode, then null. */
  reads: Array<Decoded | null>;
  /** Every decode the scanner asked for. */
  decodes: number;
  /** While set, each decode waits for `releaseDecodes`. */
  holdDecodes: boolean;
  releaseDecodes: (result: Decoded | null) => void;
  /** The decoder fails to load. */
  decoderFails: () => void;
  /** The video's frame size from now on. 1280 by 720 by default. */
  frame: { width: number; height: number };
  /** The source rectangle of every frame drawn to the canvas, as `[sx, sy, sw, sh, dw, dh]`. */
  drawn: number[][];
  /** Every size the canvas was set to, as `width` or `height` assignments. */
  canvasSizings: number;
  uninstall: () => void;
}

/**
 * Gives the browser a camera API and nothing behind it, for a test that only
 * needs the camera button and Scan again to show. Returns the undo.
 */
export function installCameraApiOnly(): () => void {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: jest.fn() }, configurable: true });
  return () => {
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  };
}

/** Stubs the camera, the video, the canvas and the decoder. Returns the controls; call `uninstall` after each test. */
export function installCamera(): FakeCamera {
  const media = navigator as unknown as { mediaDevices?: unknown };
  const hadMedia = Object.prototype.hasOwnProperty.call(navigator, "mediaDevices");
  const originals = {
    play: HTMLMediaElement.prototype.play,
    getContext: HTMLCanvasElement.prototype.getContext,
    rect: Element.prototype.getBoundingClientRect,
    canvasWidth: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width")!,
    canvasHeight: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "height")!,
  };
  const held: Array<(r: Decoded | null) => void> = [];

  const camera: FakeCamera = {
    getUserMedia: jest.fn(),
    streams: [],
    capabilities: {},
    reads: [],
    decodes: 0,
    holdDecodes: false,
    frame: { width: 1280, height: 720 },
    drawn: [],
    canvasSizings: 0,
    hold: () => {
      const answer = deferred<FakeStream>();
      camera.getUserMedia.mockImplementationOnce(() => answer.promise);
      return {
        grant: (capabilities = camera.capabilities) => {
          const stream = fakeStream(capabilities);
          camera.streams.push(stream);
          answer.resolve(stream);
          return stream;
        },
        refuse: (name) => answer.reject(cameraError(name)),
      };
    },
    refuseNext: (name) => {
      camera.getUserMedia.mockImplementationOnce(() => Promise.reject(cameraError(name)));
    },
    releaseDecodes: (result) => {
      for (const answer of held.splice(0)) answer(result);
    },
    decoderFails: () => {
      jest.mocked(loadDecoder).mockRejectedValue(new Error("no wasm"));
    },
    uninstall: () => {
      if (!hadMedia) delete media.mediaDevices;
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
      HTMLMediaElement.prototype.play = originals.play;
      HTMLCanvasElement.prototype.getContext = originals.getContext;
      Element.prototype.getBoundingClientRect = originals.rect;
      Object.defineProperty(HTMLCanvasElement.prototype, "width", originals.canvasWidth);
      Object.defineProperty(HTMLCanvasElement.prototype, "height", originals.canvasHeight);
      for (const prop of ["readyState", "videoWidth", "videoHeight"]) {
        delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)[prop];
      }
    },
  };

  camera.getUserMedia.mockImplementation(async () => {
    const stream = fakeStream(camera.capabilities);
    camera.streams.push(stream);
    return stream;
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: camera.getUserMedia },
    configurable: true,
  });

  // A video that has a frame, 1280 by 720 unless the test says otherwise, as soon as it has a stream.
  HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve();
  };
  for (const [prop, value] of [
    ["readyState", () => 4],
    ["videoWidth", () => camera.frame.width],
    ["videoHeight", () => camera.frame.height],
  ] as const) {
    Object.defineProperty(HTMLVideoElement.prototype, prop, { get: value, configurable: true });
  }
  // The picture's layout: the video fills a 350 by 262.5 box, and the band is inset 20 pixels at the
  // sides and a quarter of the height at the top and the bottom (ScannerSheet.tsx).
  const rect = (x: number, y: number, width: number, height: number): DOMRect =>
    ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    if (this instanceof HTMLVideoElement) return rect(20, 100, 350, 262.5);
    if (this.hasAttribute("data-scanner-band")) return rect(40, 100 + 65.625, 310, 131.25);
    return originals.rect.call(this);
  };
  for (const prop of ["width", "height"] as const) {
    const own = new WeakMap<HTMLCanvasElement, number>();
    Object.defineProperty(HTMLCanvasElement.prototype, prop, {
      configurable: true,
      get(this: HTMLCanvasElement) {
        return own.get(this) ?? (prop === "width" ? 300 : 150);
      },
      set(this: HTMLCanvasElement, value: number) {
        camera.canvasSizings += 1;
        own.set(this, value);
      },
    });
  }
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      drawImage: (_video: unknown, ...rect: number[]) => {
        camera.drawn.push(rect.slice(0, 4).concat(rect.slice(6, 8)));
      },
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;

  jest
    .mocked(loadDecoder)
    .mockReset()
    .mockResolvedValue(async () => {
      camera.decodes += 1;
      if (camera.holdDecodes) return new Promise<Decoded | null>((resolve) => held.push(resolve));
      return camera.reads.shift() ?? null;
    });
  return camera;
}

/** Every track of every stream handed out has stopped. */
export function everyTrackStopped(camera: FakeCamera): boolean {
  return camera.streams.every((s) => s.tracks.every((t) => t.stop.mock.calls.length > 0 && t.readyState === "ended"));
}

/** The page goes to the background, or comes back. */
export function setPageHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}
