import { api } from "@/lib/api";
import { getOwnFoods } from "../foods";

// The own-food list asks the route for its most: without a limit the server
// answers its default of 100, and every list of own foods stopped there.

jest.mock("@/lib/api", () => ({ api: { get: jest.fn() } }));

it("asks GET /foods/own for 200 foods, the route's maximum", async () => {
  jest.mocked(api.get).mockResolvedValue({ data: { foods: [] } });
  const signal = new AbortController().signal;
  await getOwnFoods({ signal });
  expect(api.get).toHaveBeenCalledWith("/foods/own", { params: { limit: 200 }, signal });
});
