import { useAuth } from "@/contexts/AuthContext";
import { resetPassword } from "@/lib/api/auth";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { fakeAuth, testPassword } from "../../../../__tests__/helpers/auth";
import ResetPasswordPage from "../page";

jest.mock("@/lib/api/auth", () => ({ resetPassword: jest.fn() }));
const mockReplace = jest.fn();
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockParams,
}));
const reset = jest.mocked(resetPassword);

const token = (): string => crypto.randomUUID();

function submit(password: string, repeat: string): void {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: repeat } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
}

jest.mock("@/contexts/AuthContext");
beforeEach(() => jest.mocked(useAuth).mockReturnValue(fakeAuth("unauthenticated")));
beforeEach(() => {
  reset.mockReset();
  mockReplace.mockReset();
});

describe("ResetPasswordPage", () => {
  it("says the link is invalid when it carries no token", () => {
    mockParams = new URLSearchParams();
    render(<ResetPasswordPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("This password reset link is invalid or has expired.");
    expect(screen.getByRole("link", { name: "Ask for a new reset link" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("refuses two passwords that differ", async () => {
    mockParams = new URLSearchParams({ token: token() });
    render(<ResetPasswordPage />);
    submit(testPassword(), testPassword());
    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it("saves the password and goes to sign-in with the note", async () => {
    const t = token();
    const password = testPassword();
    mockParams = new URLSearchParams({ token: t });
    reset.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);
    submit(password, password);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in?reset=1"));
    expect(reset).toHaveBeenCalledWith({ token: t, newPassword: password });
  });

  it("shows the line for a spent or expired link", async () => {
    mockParams = new URLSearchParams({ token: token() });
    reset.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { code: "reset_link_invalid" },
      } as AxiosResponse),
    );
    const password = testPassword();
    render(<ResetPasswordPage />);
    submit(password, password);
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
  });

  // The reset page sits outside the guest guard, so a link opened in a
  // signed-in browser shows its form instead of sending the person away.
  it("shows the form to a signed-in browser, and after the reset signs this device out with the note", async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut }));
    mockParams = new URLSearchParams({ token: token() });
    reset.mockResolvedValue(undefined);
    const password = testPassword();
    render(<ResetPasswordPage />);
    submit(password, password);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ to: "/auth/sign-in?reset=1" }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("signs nothing out when the reset is refused", async () => {
    const signOut = jest.fn();
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signOut }));
    mockParams = new URLSearchParams({ token: token() });
    reset.mockRejectedValue(new AxiosError("down", "ERR_NETWORK"));
    const password = testPassword();
    render(<ResetPasswordPage />);
    submit(password, password);
    await screen.findByText(/cannot be reached/);
    expect(signOut).not.toHaveBeenCalled();
  });
});
