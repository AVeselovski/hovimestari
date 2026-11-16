import { stubPhone } from "@/__tests__/formSheet";
import { useAuth } from "@/contexts/AuthContext";
import { putTargets } from "@/lib/api/targets";
import { deleteAccount } from "@/lib/api/users";
import { queryKeys } from "@/lib/queryKeys";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TEST_USER, fakeAuth, testPassword } from "../../../__tests__/helpers/auth";
import { createTestQueryClient, queryWrapper } from "../../../__tests__/helpers/queryClient";
import { FirstRunTargets } from "../FirstRunTargets";
import { TODAY, change, refusal } from "./support";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), deleteAccount: jest.fn() }));
jest.mock("@/lib/forgetDevice", () => ({ forgetSignedInPages: jest.fn().mockResolvedValue(undefined) }));

const signOut = jest.fn();
beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut }));
  jest.mocked(putTargets).mockReset().mockResolvedValue(change(TODAY));
  jest.mocked(deleteAccount).mockReset().mockResolvedValue(undefined);
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
    expect(await within(group("Calories")).findByText("The second number cannot be below the first.")).toBeVisible();
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
    expect(await within(group("Calories")).findByText("Enter a number below 100000, with one decimal at most.")).toBe(
      caloriesLine,
    );
    expect(within(group("Protein")).getByText("Enter a number below 10000, with one decimal at most.")).toBe(
      proteinLine,
    );
    // The same element before and after, with two lines of room either way.
    for (const line of [caloriesLine, proteinLine]) expect(line.className.split(/\s+/)).toContain("min-h-10");
  });

  it("says a number that may hold a thousands group with the group line, not the group's limit", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    type("Calories", "From", "1,800");
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(
      await within(group("Calories")).findByText(
        "This may mean thousands. Type it with no comma or point, or with fewer decimals.",
      ),
    ).toBeInTheDocument();
    expect(putTargets).not.toHaveBeenCalled();
  });

  it("shows a refusal from the server by its code, and lets Save run again", async () => {
    jest.mocked(putTargets).mockRejectedValueOnce(refusal(400, "target_value_invalid"));
    render(<FirstRunTargets today={TODAY} />);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A number is too large or has more than one decimal.");
    expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
  });

  it("on a phone focuses no field on load; from md the first field takes focus", () => {
    const restore = stubPhone();
    try {
      const { unmount } = render(<FirstRunTargets today={TODAY} />);
      expect(document.activeElement).toBe(document.body);
      unmount();
    } finally {
      restore();
    }
    render(<FirstRunTargets today={TODAY} />);
    expect(field("Calories", "From")).toHaveFocus();
  });

  it("says who is signed in, and signs out", async () => {
    render(<FirstRunTargets today={TODAY} />);
    expect(screen.getByText(TEST_USER.email).closest("p")).toHaveTextContent(
      new RegExp(`^Signed in as ${TEST_USER.email}$`),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith());
  });

  it("offers Delete account, which opens the delete sheet and deletes without any targets", async () => {
    render(<FirstRunTargets today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete your account?" });
    fireEvent.change(within(sheet).getByLabelText("Password"), { target: { value: testPassword() } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ to: "/auth/sign-in?deleted=1" }));
    expect(putTargets).not.toHaveBeenCalled();
  });
});
