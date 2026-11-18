import { stubPhone } from "@/__tests__/formSheet";
import { useAuth } from "@/contexts/AuthContext";
import { getTargets, putTargets } from "@/lib/api/targets";
import { finishFirstRun } from "@/lib/api/users";
import { queryKeys } from "@/lib/queryKeys";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { fakeAuth } from "../../../__tests__/helpers/auth";
import { createTestQueryClient, deferred, queryWrapper } from "../../../__tests__/helpers/queryClient";
import { FirstRunTargets } from "../FirstRunTargets";
import { TODAY, change, overview, refusal } from "./support";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), deleteAccount: jest.fn(), finishFirstRun: jest.fn() }));
jest.mock("@/lib/forgetDevice", () => ({ forgetSignedInPages: jest.fn().mockResolvedValue(undefined) }));

const signOut = jest.fn();
beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut }));
  jest.mocked(putTargets).mockReset().mockResolvedValue(change(TODAY));
  jest.mocked(finishFirstRun).mockReset().mockResolvedValue(undefined);
});

const group = (name: "Calories" | "Protein") => screen.getByRole("group", { name });
const field = (g: "Calories" | "Protein", bound: "From" | "To") =>
  within(group(g)).getByLabelText(bound) as HTMLInputElement;
const type = (g: "Calories" | "Protein", bound: "From" | "To", value: string) =>
  fireEvent.change(field(g, bound), { target: { value } });
function fillAll(): void {
  type("Calories", "From", "1800");
  type("Calories", "To", "2200");
  type("Protein", "From", "120,5");
  type("Protein", "To", "160");
}

describe("FirstRunTargets", () => {
  it("says in its lead that the targets apply from today", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(
      screen.getByText(
        "Enter the ranges you aim for each day. They apply from today, and you can change them in Settings at any time.",
      ),
    ).toBeInTheDocument();
  });

  it("opens with every field empty, no placeholder, and no number anywhere in the form", () => {
    render(<FirstRunTargets today={TODAY} />);
    const form = screen.getByRole("button", { name: "Save targets" }).closest("form")!;
    const inputs = within(form).getAllByRole("textbox");
    expect(inputs).toHaveLength(4);
    for (const input of inputs) {
      expect(input).toHaveValue("");
      expect(input).not.toHaveAttribute("placeholder");
    }
    expect(form.textContent).not.toMatch(/\d/);
    expect(document.body.querySelectorAll("[placeholder]")).toHaveLength(0);
  });

  it("stays empty even when targets are within its reach: the first run offers no number, the user's own included", async () => {
    // Targets in the cache and on the server, as if another device had just saved some.
    const known = change(TODAY, [1800, 2200], [120, 160]);
    jest.mocked(getTargets).mockResolvedValue(overview([known]));
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.targets(), overview([known]));
    render(<FirstRunTargets today={TODAY} />, { wrapper: queryWrapper(client) });
    await act(async () => {});
    const form = screen.getByRole("form", { name: "Your daily targets" });
    for (const input of within(form).getAllByRole("textbox")) expect(input).toHaveValue("");
    expect(form.textContent).not.toMatch(/\d/);
  });

  it("is a form named by the page's title", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(screen.getByRole("form", { name: "Your daily targets" })).toContainElement(
      screen.getByRole("button", { name: "Save targets" }),
    );
  });

  it("asks for calories with the whole-number keypad and protein with the decimal one", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(field("Calories", "From")).toHaveAttribute("inputmode", "numeric");
    expect(field("Calories", "To")).toHaveAttribute("inputmode", "numeric");
    expect(field("Protein", "From")).toHaveAttribute("inputmode", "decimal");
    expect(field("Protein", "To")).toHaveAttribute("type", "text");
  });

  it("labels the Enter key next on every field but the last, which reads done", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(field("Calories", "From")).toHaveAttribute("enterkeyhint", "next");
    expect(field("Calories", "To")).toHaveAttribute("enterkeyhint", "next");
    expect(field("Protein", "From")).toHaveAttribute("enterkeyhint", "next");
    expect(field("Protein", "To")).toHaveAttribute("enterkeyhint", "done");
  });

  it("says the protein lower bound is a floor, and that the app gives no advice", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(within(group("Protein")).getByText("The lower number is your floor.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter.",
      ),
    ).toBeInTheDocument();
  });

  it("saves the targets on the server's today, reading a decimal comma, and reads the targets again", async () => {
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    render(<FirstRunTargets today={TODAY} />, { wrapper: queryWrapper(client) });
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    await waitFor(() =>
      expect(putTargets).toHaveBeenCalledWith(TODAY, {
        ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120.5, upper: 160 } },
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.targets() }));
  });

  it("shows the copy for lower above upper under the pair, and focuses the field", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    type("Calories", "To", "1500");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(await within(group("Calories")).findByText("To cannot be lower than From.")).toBeVisible();
    expect(field("Calories", "To")).toHaveAttribute("aria-invalid", "true");
    expect(field("Calories", "From")).not.toHaveAttribute("aria-invalid");
    expect(field("Calories", "To")).toHaveFocus();
    expect(putTargets).not.toHaveBeenCalled();
  });

  it("shows the copy for zero, and for an empty field", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    type("Protein", "From", "0");
    type("Calories", "From", "");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(await within(group("Protein")).findByText("Enter a number above zero.")).toBeInTheDocument();
    expect(within(group("Calories")).getByText("Enter a number.")).toBeInTheDocument();
    expect(field("Calories", "From")).toHaveFocus();
  });

  it("says a number a group cannot take with that group's own limit, in the line under its pair", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    const caloriesLine = within(group("Calories")).getByText((_, el) => el?.id.endsWith("energyLower-line") ?? false);
    const proteinLine = within(group("Protein")).getByText("The lower number is your floor.");
    type("Calories", "To", "100000");
    type("Protein", "From", "12,25");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(await within(group("Calories")).findByText("Enter below 100000, one decimal at most.")).toBe(caloriesLine);
    expect(within(group("Protein")).getByText("Enter below 10000, one decimal at most.")).toBe(proteinLine);
    // The same element before and after, with one line of room either way, which each line fits at 320.
    for (const line of [caloriesLine, proteinLine]) expect(line.className.split(/\s+/)).toContain("min-h-5");
  });

  it("says a number that may hold a thousands group with the group line, not the group's limit", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    type("Calories", "From", "1,800");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(await within(group("Calories")).findByText("No comma or point, or fewer decimals.")).toBeInTheDocument();
    expect(putTargets).not.toHaveBeenCalled();
  });

  it("shows a refusal from the server by its code, and lets Save run again", async () => {
    jest.mocked(putTargets).mockRejectedValueOnce(refusal(400, "target_value_invalid"));
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("A number is too large or has more than one decimal."),
    );
    expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
  });

  it("puts focus back in the first field after a refusal from the server, as sign-in does", async () => {
    jest.mocked(putTargets).mockRejectedValueOnce(refusal(503, "server_unreachable"));
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    // Enter in the last field: every field and the button are disabled while it saves,
    // so the browser drops focus to the page.
    field("Protein", "To").focus();
    fireEvent.submit(screen.getByRole("form", { name: "Your daily targets" }));
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeEmptyDOMElement());
    expect(field("Calories", "From")).toHaveFocus();
    expect(field("Calories", "From")).toBeEnabled();
  });

  it("on a phone focuses the page's title on load, never a field; from md the first field takes focus", () => {
    const restore = stubPhone();
    try {
      const { unmount } = render(<FirstRunTargets today={TODAY} />);
      expect(screen.getByRole("heading", { name: "Your daily targets" })).toHaveFocus();
      expect(document.activeElement?.tagName).not.toBe("INPUT");
      unmount();
    } finally {
      restore();
    }
    render(<FirstRunTargets today={TODAY} />);
    expect(field("Calories", "From")).toHaveFocus();
  });

  it("offers no account controls: Sign out and Delete account are in Settings", () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  describe("Continue without targets", () => {
    const go = () => screen.getByRole("button", { name: /^Continu/ });

    it("sits under Save, full width, as a plain ink text button that does not compete with Save", () => {
      render(<FirstRunTargets today={TODAY} />);
      const save = screen.getByRole("button", { name: "Save targets" });
      expect(save.nextElementSibling).toBe(go());
      expect(go()).toHaveAttribute("type", "button");
      const tokens = go().className.split(/\s+/);
      expect(tokens).toEqual(expect.arrayContaining(["w-full", "justify-center", "mt-4", "min-h-11", "text-ink"]));
      // No fill, no accent, no icon: not a second primary action, not a warning.
      expect(tokens.filter((c) => /^(bg-|text-accent|border-accent)/.test(c))).toEqual([]);
      expect(go().querySelector("svg")).toBeNull();
    });

    it("on the self-shown page records the first run, and stays busy until the tabs replace it", async () => {
      const answer = deferred<void>();
      jest.mocked(finishFirstRun).mockReturnValue(answer.promise);
      const client = createTestQueryClient();
      const invalidate = jest.spyOn(client, "invalidateQueries");
      render(<FirstRunTargets today={TODAY} />, { wrapper: queryWrapper(client) });
      fireEvent.click(go());
      expect(finishFirstRun).toHaveBeenCalledTimes(1);
      // Both actions and every field are locked, and the pressed one says it works.
      expect(go()).toBeDisabled();
      expect(go()).toHaveAccessibleName("Continuing…");
      expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
      for (const input of screen.getAllByRole("textbox")) expect(input).toBeDisabled();
      await act(async () => answer.resolve());
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.targets() }));
      expect(putTargets).not.toHaveBeenCalled();
    });

    it("opened again, leaves at once and records nothing", () => {
      const onLeave = jest.fn();
      render(<FirstRunTargets today={TODAY} onLeave={onLeave} />);
      fireEvent.click(go());
      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(finishFirstRun).not.toHaveBeenCalled();
    });

    it("is locked while Save works", async () => {
      const answer = deferred<ReturnType<typeof change>>();
      jest.mocked(putTargets).mockReturnValue(answer.promise);
      render(<FirstRunTargets today={TODAY} />);
      fillAll();
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      expect(go()).toBeDisabled();
      expect(go()).toHaveAccessibleName("Continue without targets");
      await act(async () => answer.resolve(change(TODAY)));
    });
  });

  it("opened again, a successful Save leaves once the save is stored", async () => {
    const onLeave = jest.fn();
    render(<FirstRunTargets today={TODAY} onLeave={onLeave} />);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(putTargets).toHaveBeenCalledWith(TODAY, expect.anything());
  });

  describe("while the device is offline", () => {
    /** What axios rejects with when no answer came. */
    const noAnswer = () => Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" });
    const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { value, configurable: true });
    beforeEach(() => setOnline(false));
    afterEach(() => setOnline(true));

    it("Save says the device is offline, as every form does, and the page stays with Save working", async () => {
      jest.mocked(putTargets).mockRejectedValueOnce(noAnswer());
      render(<FirstRunTargets today={TODAY} />);
      fillAll();
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection."),
      );
      expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Continue without targets" })).toBeEnabled();
    });

    it("self-shown, Continue says the device is offline and the page stays, ready to try again", async () => {
      jest.mocked(finishFirstRun).mockRejectedValueOnce(noAnswer());
      render(<FirstRunTargets today={TODAY} />);
      const go = screen.getByRole("button", { name: "Continue without targets" });
      fireEvent.click(go);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection."),
      );
      expect(go).toBeEnabled();
      expect(go).toHaveFocus();
      fireEvent.click(go);
      await waitFor(() => expect(finishFirstRun).toHaveBeenCalledTimes(2));
    });

    it("opened again, Continue leaves at once, since it sends nothing", () => {
      const onLeave = jest.fn();
      render(<FirstRunTargets today={TODAY} onLeave={onLeave} />);
      fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(finishFirstRun).not.toHaveBeenCalled();
    });
  });
});
