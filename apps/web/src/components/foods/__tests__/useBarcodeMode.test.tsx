import { refusal } from "@/components/targets/__tests__/support";
import { lookupBarcode } from "@/lib/api/foods";
import type { BarcodeLookup } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { useBarcodeMode, type BarcodeMode } from "../useBarcodeMode";

// Barcode mode's contract with a scan: the format a scan sent is held with
// the code, so Try again and Enter send it again, and a number typed by hand
// sends none.

jest.mock("@/lib/api/foods", () => ({ lookupBarcode: jest.fn() }));

const CODE = "04000017";
let mode: BarcodeMode;
let setText: (text: string) => void;

function Harness(): ReactElement {
  const [text, set] = useState(CODE);
  setText = (next) => {
    set(next);
    mode.textChanged(next);
  };
  mode = useBarcodeMode({
    query: text,
    canOpenFood: false,
    showFood: jest.fn(),
    onFromLabel: jest.fn(),
    blurField: jest.fn(),
    onSearchByName: jest.fn(),
  });
  return <div>{mode.block}</div>;
}

beforeEach(() => {
  jest
    .mocked(lookupBarcode)
    .mockReset()
    .mockImplementation(async (): Promise<BarcodeLookup> => {
      throw refusal(503, "barcode_lookup_unavailable");
    });
});

const formats = () => jest.mocked(lookupBarcode).mock.calls.map(([code, format]) => [code, format ?? null]);

describe("useBarcodeMode and a scan's format", () => {
  it("sends a scan's format again on Try again and on Enter", async () => {
    render(<Harness />);
    // A scan: the field holds the code it read, then the lookup runs with its format.
    await act(async () => mode.lookUp(CODE, "upc_e"));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lookupBarcode).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Try again" });
    await act(async () => mode.onEnter?.());
    await waitFor(() => expect(lookupBarcode).toHaveBeenCalledTimes(3));
    expect(formats()).toEqual([
      [CODE, "upc_e"],
      [CODE, "upc_e"],
      [CODE, "upc_e"],
    ]);
  });

  it("sends no format for a number typed by hand after a scan", async () => {
    render(<Harness />);
    await act(async () => mode.lookUp(CODE, "upc_e"));
    await screen.findByRole("button", { name: "Try again" });
    act(() => setText("6408430000258"));
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(lookupBarcode).toHaveBeenCalledTimes(2));
    expect(formats()[1]).toEqual(["6408430000258", null]);
  });
});
