import { confirmArmed } from "@/__tests__/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { deleteAccount, getMe } from "@/lib/api/users";
import { forgetSignedInPages } from "@/lib/forgetDevice";
import { markSession } from "@/lib/sessionMarker";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";
import { TEST_USER, fakeAuth, testPassword } from "../../../../__tests__/helpers/auth";
import { AccountSection } from "../_components/AccountSection";
import { AppearanceSection } from "../_components/AppearanceSection";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), deleteAccount: jest.fn() }));
jest.mock("@/lib/forgetDevice", () => ({ forgetSignedInPages: jest.fn() }));

const signOut = jest.fn();
beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  jest.mocked(getMe).mockReset().mockResolvedValue(TEST_USER);
  jest.mocked(deleteAccount).mockReset().mockResolvedValue(undefined);
  jest.mocked(forgetSignedInPages).mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut }));
});

describe("Settings", () => {
  it("Appearance offers Light, Dark and Device", () => {
    render(<AppearanceSection />, {
      wrapper: ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Light", "Dark", "Device"]);
  });

  it("Account says who is signed in, read from the account", async () => {
    jest.mocked(getMe).mockResolvedValue({ ...TEST_USER, email: "fresh@example.com" });
    render(<AccountSection />);
    expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent(`Signed in as ${TEST_USER.email}`);
    await waitFor(() => expect(screen.getByText("fresh@example.com")).toBeInTheDocument());
  });

  it("Account signs this device out", async () => {
    render(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith());
  });

  it("does not read the account while the server is out of reach", () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline", { signOut }));
    render(<AccountSection />);
    expect(getMe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("a long email", () => {
  it("can break before its @ and dots, and nowhere is it cut", async () => {
    const email = "firstname.lastname.withaverylongpart@subdomain.example.com";
    jest.mocked(getMe).mockResolvedValue({ ...TEST_USER, email });
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut, user: { ...TEST_USER, email } }));
    render(<AccountSection />);
    const strong = screen.getByRole("region", { name: "Account" }).querySelector("strong")!;
    expect(strong.textContent).toBe(email);
    expect(strong.querySelectorAll("wbr")).toHaveLength(email.split(/(?=[@.])/).length - 1);
  });
});

describe("Account while the server is out of reach", () => {
  it("names the address this device was last signed in to, without saying it was just checked", () => {
    markSession(true, "last@example.com");
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline", { signOut }));
    render(<AccountSection />);
    const region = screen.getByRole("region", { name: "Account" });
    expect(region).toHaveTextContent("Last signed in as last@example.com");
    expect(region).not.toHaveTextContent("Signed in as last@example.com");
  });

  it("names no address once this device has signed out", () => {
    markSession(true, "last@example.com");
    markSession(false);
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline", { signOut }));
    render(<AccountSection />);
    expect(screen.getByRole("region", { name: "Account" })).not.toHaveTextContent("@");
  });
});

describe("Sign out on all devices", () => {
  async function confirmEverywhere(): Promise<HTMLElement> {
    render(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out on all devices" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out on all devices?" });
    expect(dialog).toHaveTextContent("This device signs out now. Other devices sign out within 15 minutes.");
    await confirmArmed();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    });
    return dialog;
  }

  it("signs out everywhere after the confirmation", async () => {
    await confirmEverywhere();
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ everywhere: true }));
  });

  it("names its button Signing out while it works", async () => {
    signOut.mockReturnValue(new Promise(() => {}));
    const dialog = await confirmEverywhere();
    expect(await within(dialog).findByRole("button", { name: "Signing out…" })).toBeDisabled();
  });

  it("when the server cannot be reached, says so in the dialog and changes nothing", async () => {
    signOut.mockRejectedValue(new AxiosError("down", "ERR_NETWORK"));
    const dialog = await confirmEverywhere();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not sign out other devices. Check your connection and try again.",
    );
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("shows any other failure by its code", async () => {
    signOut.mockRejectedValue(
      new AxiosError("refused", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 500,
        data: {},
      } as AxiosResponse),
    );
    const dialog = await confirmEverywhere();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });
});

describe("Delete account", () => {
  it("after the deletion, clears this device and lands on sign-in with its note", async () => {
    render(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: testPassword() } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ to: "/auth/sign-in?deleted=1" }));
    expect(forgetSignedInPages).toHaveBeenCalled();
    // Before the sign-out, which takes the signed-in tree with it.
    expect(jest.mocked(forgetSignedInPages).mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
    expect(signOut).not.toHaveBeenCalledWith(expect.objectContaining({ everywhere: true }));
  });

  it("is not offered while the account is not known", () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline", { signOut }));
    render(<AccountSection />);
    expect(screen.queryByRole("button", { name: "Delete account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out on all devices" })).not.toBeInTheDocument();
  });
});
