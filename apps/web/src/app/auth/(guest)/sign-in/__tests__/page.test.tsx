import { useAuth } from "@/contexts/AuthContext";
import { ProvidersProvider } from "@/contexts/ProvidersContext";
import { AuthRequestError } from "@/lib/errors";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { fakeAuth, testPassword } from "../../../../../__tests__/helpers/auth";
import SignInPage from "../page";

jest.mock("@/contexts/AuthContext");
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));

const signIn = jest.fn();
beforeEach(() => {
  mockParams = new URLSearchParams();
  signIn.mockReset();
  sessionStorage.clear();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("unauthenticated", { signIn }));
});

function renderPage({ google = false }: { google?: boolean } = {}): void {
  render(<SignInPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ProvidersProvider google={google}>{children}</ProvidersProvider>
    ),
  });
}

function fill(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInPage", () => {
  it("shows the title, the fields and the links", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Email")).toHaveAttribute("inputmode", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/auth/sign-up");
  });

  it("shows field lines from the catalog and sends nothing for an empty form", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps a line of room under every field and above the button before any error", () => {
    renderPage();
    for (const label of ["Email", "Password"]) {
      const line = document.getElementById(screen.getByLabelText(label).id + "-line");
      expect(line).toHaveClass("min-h-5");
    }
    const alert = screen.getByRole("alert");
    expect(alert).toBeEmptyDOMElement();
    expect(alert.className.split(/\s+/)).toContain("min-h-10");
    expect(alert.className.split(/\s+/)).not.toContain("empty:hidden");
  });

  it("moves focus to the first invalid field on an invalid submit", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveFocus());
  });

  it("moves focus back to the form after a refusal, and announces it", async () => {
    signIn.mockRejectedValue(new AuthRequestError(401, "invalid_credentials"));
    renderPage();
    fill("ada@example.com", testPassword());
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password."));
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("signs in with the normalised email", async () => {
    signIn.mockResolvedValue(undefined);
    const password = testPassword();
    renderPage();
    fill("  Ada@Example.com ", password);
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: "ada@example.com", password }));
  });

  it("shows the catalog's line for the server's code, never its message", async () => {
    signIn.mockRejectedValue(new AuthRequestError(401, "invalid_credentials"));
    renderPage();
    fill("ada@example.com", testPassword());
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password."));
  });

  it("says the server cannot be reached when the request never got there", async () => {
    signIn.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    fill("ada@example.com", testPassword());
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Hovimestari cannot be reached right now."),
    );
  });

  it.each([
    ["reset=1", "Password updated. Sign in with your new password."],
    ["deleted=1", "Your account and everything in it are deleted."],
    ["error=google_failed", "Signing in with Google did not work."],
    ["error=google_email_taken", "Sign in with your password instead."],
    ["error=google_email_unverified", "Google has not verified this email address."],
    ["error=something_else", "Something went wrong. Try again."],
  ])("shows the line for ?%s", (query, text) => {
    mockParams = new URLSearchParams(query);
    renderPage();
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
  });

  it("offers Google only when the deployment has it", () => {
    renderPage({ google: false });
    expect(screen.queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("starts Google at the route handler and keeps ?redirect= for after the round trip", () => {
    mockParams = new URLSearchParams("redirect=/settings");
    renderPage({ google: true });
    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "/api/auth/google/start");
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(sessionStorage.getItem("postLoginRedirect")).toBe("/settings");
  });

  it("keeps no unsafe redirect for Google", () => {
    mockParams = new URLSearchParams("redirect=//evil.example");
    renderPage({ google: true });
    const link = screen.getByRole("link", { name: "Continue with Google" });
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(sessionStorage.getItem("postLoginRedirect")).toBeNull();
  });
});
