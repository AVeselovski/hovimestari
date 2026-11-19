import { deferred } from "@/__tests__/helpers/queryClient";
import { openSheet } from "@/__tests__/sheet";
import { DECODE_EVERY_MS } from "@/components/foods/scanner/useCameraStream";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { ScannerSheet } from "../ScannerSheet";
import { installCamera, type FakeCamera } from "./scannerFakes";

// The scanner sheet alone, on a stubbed camera and decoder: each row of the
// permissions and failures table with its line and its actions, what is
// decoded and what counts as a read, and what the sheet keeps the same from
// one state to the next. ScannerSheet.stops.test.tsx covers the camera
// stopping on every way out.

jest.mock("@/components/foods/scanner/decoder", () => ({ loadDecoder: jest.fn() }));

const TITLE = "Scan a barcode";
const REFUSED = "Hovimestari cannot use the camera. Allow it in your browser's settings.";
const NO_CAMERA = "No camera was found. Type the number instead.";
const BUSY = "Another app is using the camera.";
let camera: FakeCamera;

beforeEach(() => {
  camera = installCamera();
});
afterEach(() => {
  camera.uninstall();
  jest.useRealTimers();
});

const onRead = jest.fn();
const onTypeNumber = jest.fn();

/** The sheet as the log sheet holds it: open until Escape, a swipe or a tap outside closes it. */
function Host(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <ScannerSheet
      open={open}
      onClose={() => setOpen(false)}
      returnFocusTo={null}
      restoreFocusOnClose
      onRead={onRead}
      onTypeNumber={onTypeNumber}
    />
  );
}

const sheet = () => openSheet(TITLE)!;
const view = () => document.querySelector<HTMLElement>("[data-scanner-view]")!;
const line = () => document.querySelector("[data-scanner-line]")?.textContent;
const names = (el: HTMLElement) =>
  within(el)
    .queryAllByRole("button")
    .map((b) => b.textContent);
const buttons = () => names(sheet());
const footer = () => sheet().querySelector<HTMLElement>("[data-sheet-footer]")!;
const video = () => document.querySelector<HTMLVideoElement>("video")!;

async function scanning(): Promise<void> {
  await waitFor(() => expect(line()).toBe("Hold the barcode between the corners."));
}

/** Runs the decode loop on fake timers for `ticks` turns. */
async function decodeFor(ticks: number): Promise<void> {
  await act(() => jest.advanceTimersByTimeAsync(DECODE_EVERY_MS * ticks));
}

describe("ScannerSheet: what it shows", () => {
  it("says it is starting while the camera and the decoder load, with focus on Type the number", async () => {
    const pending = camera.hold();
    render(<Host />);
    await waitFor(() => expect(line()).toBe("Starting the camera…"));
    expect(buttons()).toEqual(["Type the number"]);
    // The ring turns over the live picture, so it is a paper arc round an ink one, as the corners are.
    const ring = view().querySelector("[data-scanner-ring]")!;
    expect(ring.className.split(" ")).toEqual(expect.arrayContaining(["animate-spin", "border-t-on-camera"]));
    expect(ring.firstElementChild!.className.split(" ")).toContain("border-t-on-camera-edge");
    expect(`${ring.className} ${ring.firstElementChild!.className}`).not.toMatch(
      /(^|\s)(text|border-t)-ink(-muted)?(\s|$)/,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Type the number" }));
    // The rear camera, no sound.
    expect(camera.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    pending.grant();
    await scanning();
  });

  it("shows the live view, plays inline and muted, and marks the band once scanning", async () => {
    render(<Host />);
    await scanning();
    expect(view().getAttribute("data-scanner-view")).toBe("scanning");
    expect(video().srcObject).toBe(camera.streams[0]);
    expect(video()).toHaveAttribute("playsinline");
    expect(video().muted).toBe(true);
    expect(video()).toHaveAttribute("aria-hidden", "true");
    // The band is mapped through a centred cover crop (visibleBand), so the picture must be cropped so.
    const fit = video()
      .className.split(" ")
      .filter((token) => token.startsWith("object-"));
    expect(fit).toEqual(["object-cover"]);
    // The band's four corners, each a paper stroke round an ink one in the tokens that hold in both themes.
    const corners = [...view().querySelectorAll("[data-band-corner]")];
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.className.split(" ")).toContain("border-on-camera");
      expect(corner.firstElementChild!.className.split(" ")).toContain("border-on-camera-edge");
    }
    expect(document.querySelector("[data-scanner-line]")).toHaveAttribute("aria-live", "polite");
    // No torch on a camera that has none.
    expect(buttons()).toEqual(["Type the number"]);
  });

  it.each([
    ["NotAllowedError", REFUSED],
    // A page the browser keeps from the camera, by a policy or as an insecure page: Settings cannot help.
    ["SecurityError", NO_CAMERA],
    ["NotFoundError", NO_CAMERA],
    ["OverconstrainedError", NO_CAMERA],
    // A browser that cannot give this page a camera, as headless Chromium answers with no prompt to show.
    ["NotSupportedError", NO_CAMERA],
    ["TypeError", NO_CAMERA],
  ])("on %s says so and offers only Type the number", async (name, text) => {
    camera.refuseNext(name);
    render(<Host />);
    await waitFor(() => expect(line()).toBe(text));
    expect(buttons()).toEqual(["Type the number"]);
  });

  it("on a busy camera offers Try again in the picture's place, which starts it again with focus kept in the sheet", async () => {
    camera.refuseNext("NotReadableError");
    render(<Host />);
    await waitFor(() => expect(line()).toBe(BUSY));
    expect(names(view())).toEqual(["Try again"]);
    expect(names(footer())).toEqual(["Type the number"]);
    const pending = camera.hold();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(line()).toBe("Starting the camera…"));
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Type the number" }));
    pending.grant();
    await scanning();
  });

  it("says the camera is busy when the camera goes away under the stream, and stops it", async () => {
    render(<Host />);
    await scanning();
    act(() => camera.streams[0].tracks[0].end());
    await waitFor(() => expect(line()).toBe(BUSY));
    expect(camera.streams[0].tracks.every((t) => t.readyState === "ended")).toBe(true);
  });

  it("says the scanner did not load when the decoder fails, and stops the camera", async () => {
    camera.decoderFails();
    render(<Host />);
    await waitFor(() => expect(line()).toBe("The scanner did not load. Type the number instead."));
    expect(buttons()).toEqual(["Type the number"]);
    expect(camera.streams[0].tracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(video().srcObject).toBeNull();
  });

  it("offers Torch over the picture only where the camera has one, and turns it on and off", async () => {
    camera.capabilities = { torch: true, focusMode: ["manual", "continuous"] };
    render(<Host />);
    await scanning();
    const track = camera.streams[0].tracks[0];
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: "continuous" }] });
    expect(names(view())).toEqual(["Torch"]);
    expect(names(footer())).toEqual(["Type the number"]);
    const torch = screen.getByRole("button", { name: "Torch" });
    expect(torch).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(torch);
    await waitFor(() => expect(torch).toHaveAttribute("aria-pressed", "true"));
    expect(track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
    fireEvent.click(torch);
    await waitFor(() => expect(torch).toHaveAttribute("aria-pressed", "false"));
  });

  it("turns the torch back off on a second tap that comes before the camera answered the first", async () => {
    camera.capabilities = { torch: true };
    render(<Host />);
    await scanning();
    const track = camera.streams[0].tracks[0];
    const answers = [deferred<void>(), deferred<void>()];
    track.applyConstraints.mockImplementationOnce(() => answers[0].promise);
    track.applyConstraints.mockImplementationOnce(() => answers[1].promise);
    const torch = screen.getByRole("button", { name: "Torch" });
    fireEvent.click(torch);
    fireEvent.click(torch);
    expect(track.applyConstraints.mock.calls.slice(-2)).toEqual([
      [{ advanced: [{ torch: true }] }],
      [{ advanced: [{ torch: false }] }],
    ]);
    await act(async () => {
      answers[0].resolve();
      answers[1].resolve();
    });
    expect(torch).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the torch off on a camera started again, whatever the stopped one answers late", async () => {
    camera.capabilities = { torch: true };
    render(<Host />);
    await scanning();
    const answer = deferred<void>();
    camera.streams[0].tracks[0].applyConstraints.mockImplementationOnce(() => answer.promise);
    fireEvent.click(screen.getByRole("button", { name: "Torch" }));
    // The camera goes away, and is started again, before it answered.
    act(() => camera.streams[0].tracks[0].end());
    await waitFor(() => expect(line()).toBe(BUSY));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await scanning();
    await act(async () => answer.resolve());
    expect(screen.getByRole("button", { name: "Torch" })).toHaveAttribute("aria-pressed", "false");
  });

  it("hands Type the number to the host", async () => {
    render(<Host />);
    await scanning();
    fireEvent.click(screen.getByRole("button", { name: "Type the number" }));
    expect(onTypeNumber).toHaveBeenCalledTimes(1);
  });

  it("sends focus that lands on the sheet itself, as a double tap's second tap does, on to Type the number", async () => {
    render(<Host />);
    await scanning();
    act(() => sheet().focus());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Type the number" }));
  });
});

describe("ScannerSheet: the same sheet in every state", () => {
  // What a state adds sits inside the picture's fixed box, the footer holds Type the number alone,
  // and the line keeps room for the longest line any state shows. The boxes are measured in a
  // browser (docs/app/log-sheet.md, Layout). This holds the structure that makes them hold.
  const states: Array<[string, () => void, string]> = [
    ["scanning", () => {}, "Hold the barcode between the corners."],
    ["refused", () => camera.refuseNext("NotAllowedError"), REFUSED],
    ["no camera", () => camera.refuseNext("NotFoundError"), NO_CAMERA],
    ["busy", () => camera.refuseNext("NotReadableError"), BUSY],
    ["torch", () => (camera.capabilities = { torch: true }), "Hold the barcode between the corners."],
    ["decoder failed", () => camera.decoderFails(), "The scanner did not load. Type the number instead."],
  ];

  it.each(states)(
    "%s: the footer holds Type the number alone, and the line keeps room for every line",
    async (_s, set, text) => {
      set();
      render(<Host />);
      await waitFor(() => expect(line()).toBe(text));
      expect(names(footer())).toEqual(["Type the number"]);
      const room = document.querySelector<HTMLElement>("[data-scanner-line-room]")!;
      expect(room).toHaveAttribute("aria-hidden", "true");
      expect([...room.children].map((c) => c.textContent)).toEqual([
        "Starting the camera…",
        "Hold the barcode between the corners.",
        REFUSED,
        NO_CAMERA,
        BUSY,
        "The scanner did not load. Type the number instead.",
      ]);
      // The line and its room share one grid cell, so the cell is as tall as the longest line.
      for (const el of [document.querySelector("[data-scanner-line]")!, room]) {
        expect(el.className.split(" ")).toEqual(expect.arrayContaining(["col-start-1", "row-start-1"]));
      }
    },
  );
});

describe("ScannerSheet: what is decoded and what counts as a read", () => {
  it("decodes only the part of the frame under the band, as the picture crops it", async () => {
    camera.frame = { width: 720, height: 1280 };
    render(<Host />);
    await scanning();
    await waitFor(() => expect(camera.drawn.length).toBeGreaterThan(0));
    // A portrait frame in the 350 by 262.5 picture: the band shows rows 505 to 775, inset at the sides.
    expect(camera.drawn[0]).toEqual([41, 505, 638, 270, 638, 270]);
  });

  it("sizes the canvas once for the stream, not on every frame", async () => {
    jest.useFakeTimers();
    render(<Host />);
    await scanning();
    await decodeFor(6);
    expect(camera.drawn.length).toBeGreaterThan(4);
    expect(camera.canvasSizings).toBe(2);
  });

  it("takes the first code the search field would take, with its format, and stops the camera at once", async () => {
    jest.useFakeTimers();
    camera.reads = [null, { text: "96385074", format: "ean_8" }, { text: "6408430000258", format: undefined }];
    render(<Host />);
    await scanning();
    await decodeFor(3);
    expect(onRead.mock.calls).toEqual([["96385074", "ean_8"]]);
    expect(camera.streams[0].tracks.every((t) => t.readyState === "ended")).toBe(true);
    const decodes = camera.decodes;
    // The first read wins: nothing more is decoded.
    await decodeFor(4);
    expect(camera.decodes).toBe(decodes);
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["fifteen digits", "977123456700312"],
    ["seven digits", "1234567"],
    ["letters", "ABC12345"],
  ])("ignores %s and keeps looking, with the camera on", async (_what, text) => {
    jest.useFakeTimers();
    camera.reads = [{ text, format: undefined }];
    render(<Host />);
    await scanning();
    await decodeFor(3);
    expect(camera.decodes).toBeGreaterThan(2);
    expect(onRead).not.toHaveBeenCalled();
    expect(camera.streams[0].tracks.every((t) => t.readyState === "live")).toBe(true);
    // A code it takes still reads after it.
    camera.reads.push({ text: "6408430000258", format: undefined });
    await decodeFor(2);
    expect(onRead).toHaveBeenCalledWith("6408430000258", undefined);
  });
});
