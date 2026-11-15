import { useAuth } from "@/contexts/AuthContext";
import { AuthRequestError } from "@/lib/errors";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fakeAuth, testPassword } from "../../../../../__tests__/helpers/auth";
import SignUpPage from "../page";

jest.mock("@/contexts/AuthContext");
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));

const signUp = jest.fn();
beforeEach(() => {
  mockParams = new URLSearchParams();
  signUp.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("unauthenticated", { signUp }));
});

function submit(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpPage", () => {
  it("asks for email and password only, with the length hint", () => {
    render(<SignUpPage />);
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "new-password");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });

  it("refuses a short password before sending anything, and focuses it", async () => {
    render(<SignUpPage />);
    submit("ada@example.com", "short");
    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("refuses a password past 72 bytes", async () => {
    render(<SignUpPage />);
    submit("ada@example.com", "ä".repeat(37));
    expect(await screen.findByText("This password is too long.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("creates the account", async () => {
    signUp.mockResolvedValue(undefined);
    const password = testPassword();
    render(<SignUpPage />);
    submit("ada@example.com", password);
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({ email: "ada@example.com", password }));
  });

  it.each([
    ["email_taken", "An account with this email already exists."],
    ["email_taken_google", "Sign in with Google to access it."],
    ["signup_rate_limited", "Too many sign-ups from this network."],
  ] as const)("shows the line for %s and returns focus to the field it names", async (code, text) => {
    signUp.mockRejectedValue(new AuthRequestError(code === "signup_rate_limited" ? 429 : 409, code));
    render(<SignUpPage />);
    submit("ada@example.com", testPassword());
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("carries ?redirect= to the sign-in link", () => {
    mockParams = new URLSearchParams("redirect=/recipes");
    render(<SignUpPage />);
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/auth/sign-in?redirect=%2Frecipes");
  });
});
