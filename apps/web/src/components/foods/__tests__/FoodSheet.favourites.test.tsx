import { deferred } from "@/__tests__/helpers/queryClient";
import { searchFoods, setFavourite } from "@/lib/api/foods";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { addOwn, back, installServer, openDetail, quarks, renderSheet, server, settle, type } from "./foodSheetServer";
import { detailOf, ownFood, refusal } from "./support";

// Favourite marks in the food sheet: in place, one after another, and a
// failure that puts back what the server holds (./foodSheetServer.tsx).

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  addPortion: jest.fn(),
  updatePortion: jest.fn(),
  deletePortion: jest.fn(),
  setFavourite: jest.fn(),
}));

beforeEach(installServer);
afterEach(() => onlineManager.setOnline(true));

describe("FoodSheet, favourite marks", () => {
  const starOf = () => screen.getByRole("button", { name: "Favourite" });

  it("a failed mark of one food puts back that food only: a mark of another food made since stands", async () => {
    const markA = deferred<void>();
    jest.mocked(setFavourite).mockImplementationOnce(() => markA.promise);
    renderSheet();
    type("rahka");
    await settle();
    await openDetail("Rahka, maustettu");
    fireEvent.click(starOf());
    await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", "true"));
    back();
    await openDetail("Rahka, maustamaton");
    fireEvent.click(starOf());
    await waitFor(() => expect(setFavourite).toHaveBeenCalledWith(quarks[1].id, true));
    await settle();
    // Every read from now on hangs, so only the cache decides what shows.
    server.holdReads = true;
    await act(async () => markA.reject(refusal(500, "internal_error")));
    await settle();
    expect(starOf()).toHaveAttribute("aria-pressed", "true");
    back();
    expect(
      within(screen.getByRole("button", { name: /^Rahka, maustamaton/ })).getByText("Favourite"),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^Rahka, maustettu/ })).queryByText("Favourite")).toBeNull();
    type("");
    const favourites = await screen.findByRole("region", { name: "Favourites" });
    expect(within(favourites).queryByText("Rahka, maustamaton")).toBeInTheDocument();
    expect(within(favourites).queryByText("Rahka, maustettu")).not.toBeInTheDocument();
  });

  it("runs the marks of one food in order: three quick taps arrive as on, off, on, one after another", async () => {
    const calls: Array<ReturnType<typeof deferred<void>>> = [];
    jest.mocked(setFavourite).mockImplementation(() => {
      const call = deferred<void>();
      calls.push(call);
      return call.promise;
    });
    renderSheet();
    type("rahka");
    await settle();
    await openDetail("Rahka, maustettu");
    fireEvent.click(starOf());
    await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(starOf());
    await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(starOf());
    await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", "true"));
    await settle();
    expect(setFavourite).toHaveBeenCalledTimes(1);
    await act(async () => calls[0].resolve());
    await waitFor(() => expect(setFavourite).toHaveBeenCalledTimes(2));
    await act(async () => calls[1].resolve());
    await waitFor(() => expect(setFavourite).toHaveBeenCalledTimes(3));
    await act(async () => calls[2].resolve());
    expect(jest.mocked(setFavourite).mock.calls.map(([, on]) => on)).toEqual([true, false, true]);
  });

  it("a failure in the middle of three taps leaves the state of the last tap", async () => {
    const calls: Array<ReturnType<typeof deferred<void>>> = [];
    jest.mocked(setFavourite).mockImplementation((id, on) => {
      const call = deferred<void>();
      calls.push(call);
      return call.promise.then(() => {
        server.favouriteIds = server.favouriteIds.filter((f) => f !== id);
        if (on) server.favouriteIds.push(id);
      });
    });
    renderSheet();
    type("rahka");
    await settle();
    await openDetail("Rahka, maustettu");
    for (const pressed of ["true", "false", "true"]) {
      fireEvent.click(starOf());
      await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", pressed));
    }
    await act(async () => calls[0].resolve());
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].reject(refusal(500, "internal_error")));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(starOf()).toHaveAttribute("aria-pressed", "true");
    await act(async () => calls[2].resolve());
    await settle();
    expect(starOf()).toHaveAttribute("aria-pressed", "true");
    expect(server.favouriteIds).toEqual([quarks[0].id]);
  });

  it("fails at once without a network: the star goes back and the line says why", async () => {
    jest.mocked(setFavourite).mockRejectedValue(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }));
    renderSheet();
    type("rahka");
    await settle();
    await openDetail("Rahka, maustettu");
    onlineManager.setOnline(false);
    fireEvent.click(starOf());
    await waitFor(() => expect(setFavourite).toHaveBeenCalledWith(quarks[0].id, true));
    await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
  });

  /** Every mark of a food held until the test answers it, the server's state following each one that works. */
  function heldMarks(): Array<ReturnType<typeof deferred<void>>> {
    const calls: Array<ReturnType<typeof deferred<void>>> = [];
    jest.mocked(setFavourite).mockImplementation((id, on) => {
      const call = deferred<void>();
      calls.push(call);
      return call.promise.then(() => {
        server.favouriteIds = server.favouriteIds.filter((f) => f !== id);
        if (on) server.favouriteIds.push(id);
      });
    });
    return calls;
  }

  async function tapThree(): Promise<void> {
    for (const pressed of ["true", "false", "true"]) {
      fireEvent.click(starOf());
      await waitFor(() => expect(starOf()).toHaveAttribute("aria-pressed", pressed));
    }
  }

  it("rolls back to what the server holds: on that worked, then off and on that failed, leaves every star on", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    const calls = heldMarks();
    renderSheet();
    await screen.findByRole("region", { name: "Your foods" });
    type("oma rahka");
    await settle();
    await openDetail("Oma rahka");
    await tapThree();
    await act(async () => calls[0].resolve());
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].reject(refusal(500, "internal_error")));
    await waitFor(() => expect(calls).toHaveLength(3));
    // From here only the cache decides what shows.
    server.holdReads = true;
    await act(async () => calls[2].reject(refusal(500, "internal_error")));
    await settle();
    expect(server.favouriteIds).toEqual([mine.id]);
    expect(starOf()).toHaveAttribute("aria-pressed", "true");
    back();
    expect(within(screen.getByRole("button", { name: /^Oma rahka/ })).getByText("Favourite")).toBeInTheDocument();
    // The search was marked stale by the rollback, so showing it reads it again.
    await waitFor(() => expect(searchFoods).toHaveBeenCalledTimes(2));
    type("");
    const own = await screen.findByRole("region", { name: "Your foods" });
    expect(within(within(own).getByRole("button", { name: /^Oma rahka/ })).getByText("Favourite")).toBeInTheDocument();
    const favourites = screen.getByRole("region", { name: "Favourites" });
    expect(within(favourites).getByText("Oma rahka")).toBeInTheDocument();
  });

  it("an earlier mark that fails while later ones are on their way puts nothing back", async () => {
    const calls = heldMarks();
    renderSheet();
    type("rahka");
    await settle();
    await openDetail("Rahka, maustettu");
    await tapThree();
    await act(async () => calls[0].reject(refusal(500, "internal_error")));
    await settle();
    // The taps after it stand: every row shows the last one.
    back();
    const row = () => screen.getByRole("button", { name: /^Rahka, maustettu/ });
    expect(within(row()).getByText("Favourite")).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].resolve());
    await waitFor(() => expect(calls).toHaveLength(3));
    await act(async () => calls[2].resolve());
    await settle();
    expect(within(row()).getByText("Favourite")).toBeInTheDocument();
    expect(server.favouriteIds).toEqual([quarks[0].id]);
  });
});
