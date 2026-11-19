import { holdSheetExits, openSheet, pressOutsideSheet, swipeSheetDown } from "@/__tests__/sheet";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { ScannerSheet } from "../ScannerSheet";
import { everyTrackStopped, installCamera, setPageHidden, type FakeCamera } from "./scannerFakes";

// The property that holds across every state of the scanner: no way out of
// the sheet leaves a camera track running, and a camera that comes back is a
// new one. ScannerSheet.test.tsx covers what the sheet shows.

jest.mock("@/components/foods/scanner/decoder", () => ({ loadDecoder: jest.fn() }));

const TITLE = "Scan a barcode";
let camera: FakeCamera;
const onCleanup: Array<() => void> = [];

beforeEach(() => {
  camera = installCamera();
});
afterEach(() => {
  for (const undo of onCleanup.splice(0)) undo();
  camera.uninstall();
});

const onRead = jest.fn();

function Host({ initiallyOpen = true }: { initiallyOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <ScannerSheet
      open={open}
      onClose={() => setOpen(false)}
      returnFocusTo={null}
      restoreFocusOnClose
      onRead={onRead}
      onTypeNumber={() => setOpen(false)}
    />
  );
}

const sheet = () => openSheet(TITLE);
const line = () => document.querySelector("[data-scanner-line]")?.textContent;
const video = () => document.querySelector<HTMLVideoElement>("video")!;
const live = (n: number) => camera.streams[n].tracks.every((t) => t.readyState === "live");

async function scanning(): Promise<void> {
  await waitFor(() => expect(line()).toBe("Hold the barcode between the corners."));
}

// Closing tests keep the sheet mounted while it slides out, as a browser does
// for 400 ms, so the stop comes from the close and not the unmount.
const sliding = () => onCleanup.push(holdSheetExits());

describe("ScannerSheet: every way out stops the camera", () => {
  it.each([
    ["Escape", () => fireEvent.keyDown(sheet()!, { key: "Escape" })],
    ["a press outside it", () => pressOutsideSheet()],
    ["a swipe down", () => swipeSheetDown(sheet()!)],
  ])("stops every track and empties the video as %s starts to close it", async (_way, close) => {
    render(<Host />);
    await scanning();
    // Held from here, once the sheet is at rest: a press outside a sheet still sliding in is refused.
    sliding();
    const shown = video();
    expect(everyTrackStopped(camera)).toBe(false);
    close();
    await waitFor(() => expect(everyTrackStopped(camera)).toBe(true));
    // Still on screen, sliding out, and already dark.
    expect(shown.isConnected).toBe(true);
    expect(shown.srcObject).toBeNull();
  });

  it("stops every track when the page is hidden, and starts again when it is shown with the sheet open", async () => {
    render(<Host />);
    await scanning();
    // Outside act, so React has not rendered yet: the stop runs in the event itself,
    // since a hidden page may get no render before the camera light should go off.
    // React warns that the state update in that event is outside act, which is the point here.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    setPageHidden(true);
    expect(everyTrackStopped(camera)).toBe(true);
    await act(async () => {});
    quiet.mockRestore();
    act(() => setPageHidden(false));
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2));
    await scanning();
    expect(video().srcObject).toBe(camera.streams[1]);
  });

  it("stops a stream granted while the page was hidden during the prompt, and starts a new one on show", async () => {
    const pending = camera.hold();
    render(<Host />);
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(1));
    act(() => setPageHidden(true));
    const late = await act(async () => pending.grant());
    expect(late.tracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(video().srcObject ?? null).toBeNull();
    // Hidden, it asks for nothing more.
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    act(() => setPageHidden(false));
    await scanning();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    expect(live(1)).toBe(true);
    expect(video().srcObject).toBe(camera.streams[1]);
  });

  it("stops every track on pagehide, and starts a new camera on pageshow", async () => {
    render(<Host />);
    await scanning();
    // Outside act, as for a hidden page: the stop runs in the event, before any render.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    window.dispatchEvent(new Event("pagehide"));
    expect(everyTrackStopped(camera)).toBe(true);
    expect(video().srcObject).toBeNull();
    await act(async () => {});
    quiet.mockRestore();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    await scanning();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    expect(live(1)).toBe(true);
    expect(camera.streams[0].tracks.every((t) => t.readyState === "ended")).toBe(true);
  });

  it("stops every track when the sheet unmounts", async () => {
    const view = render(<Host />);
    await scanning();
    view.unmount();
    expect(everyTrackStopped(camera)).toBe(true);
  });

  it("stops every track of a stream that arrives after the sheet closed, and never shows it", async () => {
    sliding();
    const pending = camera.hold();
    render(<Host />);
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(1));
    const shown = video();
    // Swiped away while the browser asked for the camera.
    fireEvent.keyDown(sheet()!, { key: "Escape" });
    await waitFor(() => expect(sheet()).toBeNull());
    expect(shown.isConnected).toBe(true);
    const late = await act(async () => pending.grant());
    expect(late.tracks.every((t) => t.stop.mock.calls.length === 1 && t.readyState === "ended")).toBe(true);
    expect(shown.srcObject ?? null).toBeNull();
  });

  it("stops every track of a stream that arrives after the sheet unmounted", async () => {
    const pending = camera.hold();
    const view = render(<Host />);
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(1));
    view.unmount();
    const late = await act(async () => pending.grant());
    expect(late.tracks.every((t) => t.readyState === "ended")).toBe(true);
  });

  it("dispatches nothing for a decode that lands after the sheet closed", async () => {
    sliding();
    camera.holdDecodes = true;
    render(<Host />);
    await scanning();
    await waitFor(() => expect(camera.decodes).toBe(1));
    fireEvent.keyDown(sheet()!, { key: "Escape" });
    await waitFor(() => expect(everyTrackStopped(camera)).toBe(true));
    await act(async () => camera.releaseDecodes({ text: "6408430000258", format: undefined }));
    expect(onRead).not.toHaveBeenCalled();
  });

  it("dispatches nothing for a decode that lands after the sheet unmounted", async () => {
    camera.holdDecodes = true;
    const view = render(<Host />);
    await scanning();
    await waitFor(() => expect(camera.decodes).toBe(1));
    view.unmount();
    await act(async () => camera.releaseDecodes({ text: "6408430000258", format: undefined }));
    expect(onRead).not.toHaveBeenCalled();
  });

  it("never asks for the camera while closed", () => {
    render(<Host initiallyOpen={false} />);
    expect(camera.getUserMedia).not.toHaveBeenCalled();
  });
});
