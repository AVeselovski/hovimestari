import {
  createTestQueryClient,
  deferred,
  queryWrapper,
  registerTestQueryClient,
} from "@/__tests__/helpers/queryClient";
import { lookupBarcode } from "@/lib/api/foods";
import { queryKeys } from "@/lib/queryKeys";
import type { BarcodeLookup } from "@hovimestari/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBarcodeLookup } from "../useBarcodeLookup";
import { detailOf, offFood, ownFood } from "./support";

// The hook alone: what it holds, what it sends and when, and what it drops.
// The lookup is held by hand per call, so each test owns the order answers
// land in.

jest.mock("@/lib/api/foods", () => ({ lookupBarcode: jest.fn() }));

type Pending = { code: string; answer: ReturnType<typeof deferred<BarcodeLookup>> };
let sent: Pending[] = [];

beforeEach(() => {
  sent = [];
  jest
    .mocked(lookupBarcode)
    .mockReset()
    .mockImplementation((code) => {
      const answer = deferred<BarcodeLookup>();
      sent.push({ code, answer });
      return answer.promise;
    });
});
const onCleanup: Array<() => void> = [];
afterEach(() => {
  for (const undo of onCleanup.splice(0)) undo();
});

const product = offFood("Eila laktoositon, Valio", "6408430000258");

function setup(client = registerTestQueryClient(createTestQueryClient())) {
  const onFound = jest.fn();
  const hook = renderHook(() => useBarcodeLookup({ onFound }), { wrapper: queryWrapper(client) });
  return { hook, onFound, client };
}

describe("useBarcodeLookup", () => {
  it("sends nothing until asked, then holds the code as pending and its answer once it lands", async () => {
    const { hook } = setup();
    expect(hook.result.current.state).toBeNull();
    expect(lookupBarcode).not.toHaveBeenCalled();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    expect(hook.result.current.state).toEqual({ code: "6408430000258", status: "pending" });
    await act(async () => sent[0].answer.resolve({ result: "not_found", barcode: "6408430000258" }));
    expect(hook.result.current.state).toEqual({
      code: "6408430000258",
      status: "answered",
      answer: { result: "not_found", barcode: "6408430000258" },
    });
  });

  it("sends nothing for a second press of the code already pending", async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    await act(async () => hook.result.current.lookUp("6408430000258"));
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
    // Once answered, a press is a new lookup, as Try again is.
    await act(async () => sent[0].answer.reject(new Error("no answer")));
    await act(async () => hook.result.current.lookUp("6408430000258"));
    expect(lookupBarcode).toHaveBeenCalledTimes(2);
  });

  it("lets a new code take over: the earlier answer is dropped when it lands", async () => {
    const { hook, onFound } = setup();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    await act(async () => hook.result.current.lookUp("6411401015090"));
    await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: false }));
    expect(hook.result.current.state).toEqual({ code: "6411401015090", status: "pending" });
    expect(onFound).not.toHaveBeenCalled();
    await act(async () => sent[1].answer.resolve({ result: "not_found", barcode: "6411401015090" }));
    expect(hook.result.current.state).toMatchObject({ code: "6411401015090", status: "answered" });
  });

  it("drops the held code, and an answer on its way for it, on drop", async () => {
    const { hook, onFound } = setup();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    act(() => hook.result.current.drop());
    await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: false }));
    expect(hook.result.current.state).toBeNull();
    expect(onFound).not.toHaveBeenCalled();
  });

  it("calls onFound with the food and the code, and puts the food in its cached detail", async () => {
    const { hook, onFound, client } = setup();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: false }));
    expect(onFound).toHaveBeenCalledWith(product, "6408430000258");
    expect(client.getQueryData(queryKeys.foodDetail(product.id))).toEqual(product);
  });

  it("holds a failure with its error", async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.lookUp("6408430000258"));
    const refused = new Error("refused");
    await act(async () => sent[0].answer.reject(refused));
    expect(hook.result.current.state).toEqual({ code: "6408430000258", status: "failed", error: refused });
  });

  it("offline, sends nothing and holds nothing, so nothing outlives the connection's return", async () => {
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onCleanup.push(() => onLine.mockRestore());
    const { hook } = setup();
    expect(hook.result.current.offline).toBe(true);
    await act(async () => hook.result.current.lookUp("6408430000258"));
    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBeNull();
  });

  it("sends a scan's format with the code", async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.lookUp("40000017", "ean_8"));
    expect(lookupBarcode).toHaveBeenCalledWith("40000017", "ean_8");
  });

  it("holds the format with the code, and dedupes a pending press by code and format together", async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.lookUp("40000017", "upc_e"));
    expect(hook.result.current.state).toEqual({ code: "40000017", format: "upc_e", status: "pending" });
    await act(async () => hook.result.current.lookUp("40000017", "upc_e"));
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
    // The same digits read the other way are another lookup.
    await act(async () => hook.result.current.lookUp("40000017", "ean_8"));
    expect(lookupBarcode).toHaveBeenCalledTimes(2);
    await act(async () => sent[1].answer.reject(new Error("no answer")));
    expect(hook.result.current.state).toMatchObject({ code: "40000017", format: "ean_8", status: "failed" });
  });

  describe("forget", () => {
    it("drops a found answer for that food, and nothing else", async () => {
      const { hook } = setup();
      await act(async () => hook.result.current.lookUp("6408430000258"));
      await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: false }));
      act(() => hook.result.current.forget("00000000-0000-4000-8000-ffffffffffff"));
      expect(hook.result.current.state).toMatchObject({ status: "answered" });
      act(() => hook.result.current.forget(product.id));
      expect(hook.result.current.state).toBeNull();
    });

    it("leaves an answer that names no food", async () => {
      const { hook } = setup();
      await act(async () => hook.result.current.lookUp("6408430000258"));
      await act(async () => sent[0].answer.resolve({ result: "not_found", barcode: "6408430000258" }));
      act(() => hook.result.current.forget(product.id));
      expect(hook.result.current.state).toMatchObject({ answer: { result: "not_found" } });
    });
  });

  it("marks every cached search stale on newlyVisible, also when the answer lands after unmount", async () => {
    const client = registerTestQueryClient(createTestQueryClient());
    client.setQueryData(queryKeys.foodSearch("eila"), { foods: [] });
    client.setQueryData(queryKeys.foodSearch("valio"), { foods: [] });
    const { hook } = setup(client);
    await act(async () => hook.result.current.lookUp("6408430000258"));
    hook.unmount();
    await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: true }));
    await waitFor(() => {
      for (const q of ["eila", "valio"]) {
        expect(client.getQueryState(queryKeys.foodSearch(q))?.isInvalidated).toBe(true);
      }
    });
  });

  it("leaves cached searches alone when the food was visible already", async () => {
    const client = registerTestQueryClient(createTestQueryClient());
    client.setQueryData(queryKeys.foodSearch("eila"), { foods: [] });
    const { hook } = setup(client);
    await act(async () => hook.result.current.lookUp("6408430000258"));
    await act(async () => sent[0].answer.resolve({ result: "found", food: product, newlyVisible: false }));
    expect(client.getQueryState(queryKeys.foodSearch("eila"))?.isInvalidated).toBe(false);
  });

  describe("after an own food is saved", () => {
    async function heldNotFound() {
      const setupResult = setup();
      await act(async () => setupResult.hook.result.current.lookUp("012000161155"));
      await act(async () => sent[0].answer.resolve({ result: "not_found", barcode: "0012000161155" }));
      return setupResult;
    }

    it("turns the held answer into found with that food, when the saved barcode is the held code", async () => {
      const { hook } = await heldNotFound();
      // The 13-digit form of the 12-digit code typed is the same product.
      const saved = detailOf(ownFood("Pulla"), { barcode: "0012000161155" });
      let turned = false;
      act(() => {
        turned = hook.result.current.savedOwnFood(saved);
      });
      expect(turned).toBe(true);
      expect(hook.result.current.state).toEqual({
        code: "012000161155",
        status: "answered",
        answer: { result: "found", food: saved, newlyVisible: false },
      });
      expect(lookupBarcode).toHaveBeenCalledTimes(1);
    });

    it("reads the state of now through a savedOwnFood kept from an earlier render", async () => {
      const { hook } = setup();
      // A host that kept the function from before the lookup, as a callback captured once would.
      const kept = hook.result.current.savedOwnFood;
      await act(async () => hook.result.current.lookUp("012000161155", "upc_e"));
      await act(async () => sent[0].answer.resolve({ result: "not_found", barcode: "0012000161155" }));
      const saved = detailOf(ownFood("Pulla"), { barcode: "0012000161155" });
      let turned = false;
      act(() => {
        turned = kept(saved);
      });
      expect(turned).toBe(true);
      expect(hook.result.current.state).toEqual({
        code: "012000161155",
        format: "upc_e",
        status: "answered",
        answer: { result: "found", food: saved, newlyVisible: false },
      });
    });

    it.each([
      ["another barcode", "6408430000258"],
      ["no barcode", null],
    ])("keeps the held answer when the food was saved with %s", async (_what, barcode) => {
      const { hook } = await heldNotFound();
      act(() => {
        hook.result.current.savedOwnFood(detailOf(ownFood("Pulla"), { barcode }));
      });
      expect(hook.result.current.state).toMatchObject({ status: "answered", answer: { result: "not_found" } });
    });

    it.each([
      ["another barcode", "6411401015090"],
      ["no barcode", null],
    ])("drops a found answer when its own food is saved with %s", async (_what, barcode) => {
      const mine = detailOf(ownFood("Pulla"), { barcode: "6408430000258" });
      const { hook } = setup();
      await act(async () => hook.result.current.lookUp("6408430000258"));
      await act(async () => sent[0].answer.resolve({ result: "found", food: mine, newlyVisible: false }));
      act(() => {
        hook.result.current.savedOwnFood({ ...mine, barcode });
      });
      expect(hook.result.current.state).toBeNull();
    });
  });
});
