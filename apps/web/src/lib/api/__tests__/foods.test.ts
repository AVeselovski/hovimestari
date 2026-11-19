import { api } from "@/lib/api";
import { getOwnFoods, lookupBarcode } from "../foods";

// The own-food list asks the route for its most: without a limit the server
// answers its default of 100, and every list of own foods stopped there.

jest.mock("@/lib/api", () => ({ api: { get: jest.fn(), post: jest.fn() } }));

it("asks GET /foods/own for 200 foods, the route's maximum", async () => {
  jest.mocked(api.get).mockResolvedValue({ data: { foods: [] } });
  const signal = new AbortController().signal;
  await getOwnFoods({ signal });
  expect(api.get).toHaveBeenCalledWith("/foods/own", { params: { limit: 200 }, signal });
});

describe("lookupBarcode", () => {
  beforeEach(() =>
    jest
      .mocked(api.post)
      .mockReset()
      .mockResolvedValue({ data: { result: "not_found", barcode: "1" } }),
  );

  it("sends a typed code alone, in the body", async () => {
    await lookupBarcode("6408430000258");
    expect(api.post).toHaveBeenCalledWith("/foods/lookup", { barcode: "6408430000258" });
  });

  it("sends a scan's format with the code", async () => {
    await lookupBarcode("40000017", "ean_8");
    expect(api.post).toHaveBeenCalledWith("/foods/lookup", { barcode: "40000017", format: "ean_8" });
  });
});
