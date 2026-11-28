import type { BarcodeLookup } from "@hovimestari/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { BarcodeResult } from "../BarcodeResult";
import type { BarcodeLookupState } from "../useBarcodeLookup";
import { refusal } from "./support";

// Search by name hands on the barcode the label button beside it keeps, so
// the food search carries exactly that one: the code after a miss and after
// a lookup's own refusal, the product's barcode when its figures are
// incomplete, and none after a shop's own number or digits no barcode has.

const CODE = "6416710030208";

function pressSearchByName(state: BarcodeLookupState, code = CODE): jest.Mock {
  const onSearchByName = jest.fn();
  render(
    <BarcodeResult
      code={code}
      state={state}
      offline={false}
      onLookUp={jest.fn()}
      onOpenFood={jest.fn()}
      onFromLabel={jest.fn()}
      onSearchByName={onSearchByName}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Search by name" }));
  return onSearchByName;
}

const answered = (answer: BarcodeLookup, code = CODE): BarcodeLookupState => ({ code, status: "answered", answer });

describe("BarcodeResult, Search by name", () => {
  it("hands on the code after a miss", () => {
    expect(pressSearchByName(answered({ result: "not_found", barcode: CODE }))).toHaveBeenCalledWith(CODE);
  });

  it.each(["barcode_lookup_unavailable", "barcode_lookup_busy", "barcode_lookup_limit"])(
    "hands on the code after the lookup's own refusal %s",
    (code) => {
      const state: BarcodeLookupState = { code: CODE, status: "failed", error: refusal(503, code) };
      expect(pressSearchByName(state)).toHaveBeenCalledWith(CODE);
    },
  );

  it("hands on the product's barcode when its figures are incomplete", () => {
    // The product is kept under its own 14-digit form of the code.
    const kept = `0${CODE}`;
    const answer: BarcodeLookup = {
      result: "incomplete",
      barcode: kept,
      reason: "missing_values",
      product: { name: "Filos", per100g: { energyKcal: 828, proteinG: null, carbsG: null, fatG: 92 } },
    };
    expect(pressSearchByName(answered(answer))).toHaveBeenCalledWith(kept);
  });

  it.each([
    ["a shop's own number", "20064020", { result: "in_store", barcode: "20064020" } as const],
    ["digits no barcode has", "6416710030209", { result: "wrong_digits", barcode: "6416710030209" } as const],
  ])("hands on nothing after %s", (_what, code, answer) => {
    expect(pressSearchByName(answered(answer, code), code)).toHaveBeenCalledWith(null);
  });
});
