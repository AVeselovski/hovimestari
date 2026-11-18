import { confirmArmed } from "@/__tests__/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { updateSettings } from "@/lib/api/settings";
import { deleteTargets, getTargets } from "@/lib/api/targets";
import { getMe } from "@/lib/api/users";
import { formatDay } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import type { TargetChange } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TEST_USER, fakeAuth } from "../../../../__tests__/helpers/auth";
import { createTestQueryClient, deferred, queryWrapper } from "../../../../__tests__/helpers/queryClient";
import { TODAY, change, overview, refusal } from "../../../../components/targets/__tests__/support";
import { FoodNamesSection } from "../_components/FoodNamesSection";
import { TargetsSection } from "../_components/TargetsSection";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/settings", () => ({ updateSettings: jest.fn() }));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn() }));

let changes: TargetChange[] = [];
beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest
    .mocked(getTargets)
    .mockReset()
    .mockImplementation((date) => Promise.resolve(overview(changes, date)));
  jest.mocked(deleteTargets).mockReset().mockResolvedValue(undefined);
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...TEST_USER, foodNameLanguage: "fi" });
  jest.mocked(updateSettings).mockReset();
});

const region = () => screen.getByRole("region", { name: "Targets" });

describe("Settings, Targets", () => {
  it("shows the targets in force today under the date they start on, in figures, and each later change", async () => {
    changes = [
      change("2026-10-01", [1600, 2000], [100, 140]),
      change("2026-11-01"),
      change("2026-12-01", [2000, 2400], [130, 170]),
    ];
    render(<TargetsSection />);
    const today = await within(region()).findByRole("button", { name: /^Current \(from / });
    expect(today).toHaveTextContent(`Current (from ${formatDay("2026-11-01")})`);
    expect(today).toHaveTextContent("Calories1800 to 2200 kcal");
    expect(today).toHaveTextContent("Protein120 to 160 g");
    const later = within(region()).getByRole("button", { name: new RegExp(`From ${formatDay("2026-12-01")}`) });
    expect(later).toHaveTextContent("2000 to 2400 kcal");
    // Earlier targets sit behind a disclosure.
    const summary = within(region()).getByText("Earlier targets");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(summary.closest("details")).toHaveTextContent("1600 to 2000 kcal");
    expect(
      screen.getByText(
        "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter.",
      ),
    ).toBeInTheDocument();
  });

  it("breaks a range's figures only between its halves, and keeps them on the right edge when they drop under their label", async () => {
    changes = [change("2026-11-01", [99999.9, 99999.9], [9999.9, 9999.9])];
    render(<TargetsSection />);
    const row = await within(region()).findByRole("button", { name: /^Current \(from / });
    const figures = [...row.querySelectorAll<HTMLElement>(".text-right")];
    expect(figures.map((f) => f.textContent)).toEqual(["99999.9 to 99999.9 kcal", "9999.9 to 9999.9 g"]);
    for (const figure of figures) {
      expect(figure.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-right", "ml-auto"]));
      expect(figure.parentElement?.className.split(/\s+/)).toContain("flex-wrap");
      // Two halves, each never broken: "99999.9 to" and "99999.9 kcal".
      const halves = [...figure.children];
      expect(halves.map((h) => h.textContent)).toEqual([expect.stringMatching(/ to$/), expect.stringMatching(/^9999/)]);
      for (const half of halves) expect(half.className.split(/\s+/)).toContain("whitespace-nowrap");
    }
  });

  it('sets the figures and the unit in the monospaced face, and "to" in the body face', async () => {
    changes = [change("2026-11-01", [1800, 2200], [120, 160])];
    render(<TargetsSection />);
    const row = await within(region()).findByRole("button", { name: /^Current \(from / });
    const [calories, protein] = [...row.querySelectorAll<HTMLElement>(".text-right")];
    for (const [line, mono] of [
      [calories, ["1800", "2200 kcal"]],
      [protein, ["120", "160 g"]],
    ] as const) {
      const tokens = line.className.split(/\s+/);
      expect(tokens).toContain("font-body");
      expect(tokens).not.toContain("font-mono");
      expect([...line.querySelectorAll(".font-mono")].map((m) => m.textContent)).toEqual(mono);
      // "to" is a text node of its own, outside every mono part.
      const to = [...line.querySelectorAll("*")]
        .flatMap((el) => [...el.childNodes])
        .find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === "to");
      expect(to).toBeDefined();
      expect(to!.parentElement!.closest(".font-mono")).toBeNull();
    }
  });

  it("has no Earlier targets with nothing before the change in force", async () => {
    changes = [change("2026-11-01")];
    render(<TargetsSection />);
    await within(region()).findByRole("button", { name: /^Current \(from / });
    expect(within(region()).queryByText("Earlier targets")).toBeNull();
  });

  it("labels the change in force with its own date, kept whole on one line when the label wraps", async () => {
    changes = [change("2026-10-01"), change("2026-11-17")];
    // TODAY is 2026-11-16: the change in force is the October one.
    render(<TargetsSection />);
    const row = await within(region()).findByRole("button", { name: /^Current \(from / });
    const heading = row.querySelector<HTMLElement>(".text-ink-muted")!;
    expect(heading).toHaveTextContent("Current (from October 1, 2026)");
    // The one place it may break is after "Current".
    const kept = heading.querySelector<HTMLElement>(".whitespace-nowrap")!;
    expect(kept.textContent).toBe("(from October 1, 2026)");
    expect(heading.firstChild?.textContent).toBe("Current ");
    expect(within(region()).queryByText(/In force/)).toBeNull();
  });

  it("shows no Current row for a user whose only change starts later, only that change and Change targets", async () => {
    // TODAY is 2026-11-16: no change has started, so today has no targets.
    changes = [change("2026-11-20")];
    render(<TargetsSection />);
    const row = await within(region()).findByRole("button", { name: new RegExp(`^From ${formatDay("2026-11-20")}`) });
    expect(row).toHaveTextContent("1800 to 2200 kcal");
    expect(within(region()).queryByRole("button", { name: /^Current/ })).toBeNull();
    expect(within(region()).queryByText(/cannot|reach the server/)).toBeNull();
    expect(within(region()).queryByText("Earlier targets")).toBeNull();
    expect(within(region()).getByRole("button", { name: "Change targets" })).toBeInTheDocument();
  });

  it("shows every later change as a From row while none has started", async () => {
    changes = [change("2026-11-20"), change("2026-12-01")];
    render(<TargetsSection />);
    await within(region()).findByRole("button", { name: new RegExp(`^From ${formatDay("2026-11-20")}`) });
    const headings = [...within(region()).getAllByRole("listitem")].map(
      (li) => li.querySelector(".text-ink-muted")?.textContent,
    );
    expect(headings).toEqual([`From ${formatDay("2026-11-20")}`, `From ${formatDay("2026-12-01")}`]);
  });

  const fieldValues = (sheet: HTMLElement) =>
    within(sheet)
      .getAllByRole("textbox")
      .map((f) => (f as HTMLInputElement).value);

  it("opens Change targets on today with its fields empty, for new targets", async () => {
    changes = [change("2026-10-01", [1600, 2000], [100, 140]), change("2026-11-01")];
    render(<TargetsSection />);
    fireEvent.click(await within(region()).findByRole("button", { name: "Change targets" }));
    const sheet = await screen.findByRole("dialog", { name: "Change targets" });
    expect(within(sheet).getByLabelText("Starts on")).toHaveValue(TODAY);
    expect(fieldValues(sheet)).toEqual(["", "", "", ""]);
  });

  it("opens the current change on itself, with its own targets in its fields and the days they apply to", async () => {
    changes = [change("2026-10-01", [1600, 2000], [100, 140]), change("2026-11-01")];
    render(<TargetsSection />);
    fireEvent.click(await within(region()).findByRole("button", { name: /^Current \(from / }));
    const sheet = await screen.findByRole("dialog", {
      name: "Edit targets",
      description: `Starting on ${formatDay("2026-11-01")}`,
    });
    expect(fieldValues(sheet)).toEqual(["1800", "2200", "120", "160"]);
    expect(sheet).toHaveTextContent(`These apply from ${formatDay("2026-11-01")} on. Earlier days keep their targets.`);
  });

  // The sheet stays mounted between opens (Settings keeps what it last showed),
  // so each open must start fresh: no numbers carry from one open to the next.
  it("opens each time with the fields of what it opens on, whatever was open before", async () => {
    changes = [change("2026-10-01", [1600, 2000], [100, 140]), change("2026-11-01")];
    render(<TargetsSection />);
    const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(await within(region()).findByRole("button", { name: /^Current \(from / }));
    let sheet = await screen.findByRole("dialog", {
      name: "Edit targets",
      description: `Starting on ${formatDay("2026-11-01")}`,
    });
    expect(fieldValues(sheet)).toEqual(["1800", "2200", "120", "160"]);
    fireEvent.keyDown(document, { key: "Escape" });
    await closed();

    fireEvent.click(within(region()).getByRole("button", { name: "Change targets" }));
    sheet = await screen.findByRole("dialog", { name: "Change targets" });
    expect(fieldValues(sheet)).toEqual(["", "", "", ""]);
    fireEvent.keyDown(document, { key: "Escape" });
    await closed();

    fireEvent.click(within(region()).getByText("Earlier targets"));
    fireEvent.click(within(region()).getByRole("button", { name: new RegExp(`From ${formatDay("2026-10-01")}`) }));
    sheet = await screen.findByRole("dialog", {
      name: "Edit targets",
      description: `Starting on ${formatDay("2026-10-01")}`,
    });
    expect(fieldValues(sheet)).toEqual(["1600", "2000", "100", "140"]);
  });

  it("opens a row on its own change, with the date fixed", async () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    render(<TargetsSection />);
    fireEvent.click(
      await within(region()).findByRole("button", { name: new RegExp(`From ${formatDay("2026-12-01")}`) }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Edit targets",
      description: `Starting on ${formatDay("2026-12-01")}`,
    });
    expect(within(sheet).queryByLabelText("Starts on")).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Remove these targets" })).toBeInTheDocument();
  });

  it("after a removal, puts focus on Change targets, since the row is gone", async () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    render(<TargetsSection />);
    fireEvent.click(
      await within(region()).findByRole("button", { name: new RegExp(`From ${formatDay("2026-12-01")}`) }),
    );
    const sheet = await screen.findByRole("dialog");
    changes = [change("2026-11-01")];
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: /Remove the targets/ });
    await confirmArmed();
    // Every element that takes focus from here on, in order.
    const focused: Element[] = [];
    const record = (e: FocusEvent) => focused.push(e.target as Element);
    document.addEventListener("focusin", record);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // As the two close: focus is on Change targets, and the row, still on the page, never takes it.
    expect(within(region()).getByRole("button", { name: "Change targets" })).toHaveFocus();
    expect(focused.some((el) => el.textContent?.includes("From"))).toBe(false);
    document.removeEventListener("focusin", record);
    await waitFor(() =>
      expect(
        within(region()).queryByRole("button", { name: new RegExp(`From ${formatDay("2026-12-01")}`) }),
      ).toBeNull(),
    );
    expect(within(region()).getByRole("button", { name: "Change targets" })).toHaveFocus();
  });

  it("keeps focus on the same Change targets button when removing the current change leaves only a later one", async () => {
    // The current change is the first: once it goes, today has no targets,
    // and the panel switches from a Current row to a From row.
    changes = [change("2026-11-01"), change("2026-12-01")];
    const answer = deferred<ReturnType<typeof overview>>();
    render(<TargetsSection />);
    fireEvent.click(await within(region()).findByRole("button", { name: /^Current \(from / }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: /Remove the targets/ });
    expect(confirm).toHaveTextContent(
      `Days from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")} will have no targets.`,
    );
    await confirmArmed();
    changes = [change("2026-12-01")];
    jest.mocked(getTargets).mockImplementationOnce(() => answer.promise);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const button = within(region()).getByRole("button", { name: "Change targets" });
    expect(button).toHaveFocus();
    // The refetch lands: the panel changes its state, and the focused node stays.
    await act(async () => answer.resolve(overview(changes)));
    await within(region()).findByRole("button", { name: new RegExp(`^From ${formatDay("2026-12-01")}`) });
    expect(within(region()).queryByRole("button", { name: /^Current/ })).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button).toBeInTheDocument();
  });

  it("says when the targets cannot be read", async () => {
    jest.mocked(getTargets).mockRejectedValue(refusal(503, "server_unreachable"));
    render(<TargetsSection />);
    expect(
      await within(region()).findByText("Your targets show here once Hovimestari can reach the server."),
    ).toBeInTheDocument();
    expect(within(region()).queryByRole("button", { name: "Change targets" })).toBeNull();
  });
});

describe("Settings, Food names", () => {
  const group = () => screen.getByRole("radiogroup", { name: "Food names" });

  it("shows the saved language and the hint", async () => {
    render(<FoodNamesSection />);
    await waitFor(() => expect(within(group()).getByRole("radio", { name: "Finnish" })).toBeChecked());
    expect(within(group()).getByRole("radio", { name: "English" })).not.toBeChecked();
    expect(
      screen.getByText("Food names show in this language. Search finds a food in either one."),
    ).toBeInTheDocument();
  });

  it("saves a choice at once, and refreshes the account and every food name", async () => {
    const answer = deferred<typeof TEST_USER>();
    jest.mocked(updateSettings).mockReturnValue(answer.promise);
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    render(<FoodNamesSection />, { wrapper: queryWrapper(client) });
    await waitFor(() => expect(within(group()).getByRole("radio", { name: "Finnish" })).toBeChecked());

    fireEvent.click(within(group()).getByRole("radio", { name: "English" }));
    expect(updateSettings).toHaveBeenCalledWith({ foodNameLanguage: "en" });
    // Shown at once, before the answer.
    expect(within(group()).getByRole("radio", { name: "English" })).toBeChecked();

    jest.mocked(getMe).mockResolvedValue({ ...TEST_USER, foodNameLanguage: "en" });
    await act(async () => answer.resolve({ ...TEST_USER, foodNameLanguage: "en" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.me() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.foods() });
    expect(within(group()).getByRole("radio", { name: "English" })).toBeChecked();
  });

  it("goes back to the saved choice with a line when the save fails", async () => {
    jest.mocked(updateSettings).mockRejectedValue(new TypeError("offline"));
    render(<FoodNamesSection />);
    await waitFor(() => expect(within(group()).getByRole("radio", { name: "Finnish" })).toBeChecked());
    fireEvent.click(within(group()).getByRole("radio", { name: "English" }));
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/.+/));
    expect(within(group()).getByRole("radio", { name: "Finnish" })).toBeChecked();
  });

  it("moves the choice with the arrow keys, one Tab stop", async () => {
    jest.mocked(updateSettings).mockResolvedValue({ ...TEST_USER, foodNameLanguage: "en" });
    render(<FoodNamesSection />);
    await waitFor(() => expect(within(group()).getByRole("radio", { name: "Finnish" })).toBeChecked());
    expect(within(group()).getByRole("radio", { name: "English" })).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(within(group()).getByRole("radio", { name: "Finnish" }), { key: "ArrowRight" });
    expect(updateSettings).toHaveBeenCalledWith({ foodNameLanguage: "en" });
  });
});
