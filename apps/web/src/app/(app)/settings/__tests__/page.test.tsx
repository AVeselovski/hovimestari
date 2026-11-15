import { useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getMe } from "@/lib/api/users";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TEST_USER, fakeAuth } from "../../../../__tests__/helpers/auth";
import { AccountSection } from "../_components/AccountSection";
import { AppearanceSection } from "../_components/AppearanceSection";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn() }));

const signOut = jest.fn();
beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  jest.mocked(getMe).mockReset().mockResolvedValue(TEST_USER);
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
