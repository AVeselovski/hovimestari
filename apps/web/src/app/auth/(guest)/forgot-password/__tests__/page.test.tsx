import { useAuth } from "@/contexts/AuthContext";
import { requestPasswordReset } from "@/lib/api/auth";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { fakeAuth } from "../../../../../__tests__/helpers/auth";
import ForgotPasswordPage from "../page";

jest.mock("@/lib/api/auth", () => ({ requestPasswordReset: jest.fn() }));
const request = jest.mocked(requestPasswordReset);

const ANSWER = "If an account exists with that email address, you will receive a password reset link shortly.";

function submit(email: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

jest.mock("@/contexts/AuthContext");
beforeEach(() => jest.mocked(useAuth).mockReturnValue(fakeAuth("unauthenticated")));
beforeEach(() => request.mockReset());

describe("ForgotPasswordPage", () => {
  it("checks the address before sending", async () => {
    render(<ForgotPasswordPage />);
    submit("not an address");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("gives the same answer whatever the address", async () => {
    request.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);
    submit("Ada@Example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(ANSWER);
    expect(request).toHaveBeenCalledWith({ email: "ada@example.com" });
  });

  it("gives the same answer when the request is rate limited", async () => {
    request.mockRejectedValue(
      new AxiosError("limited", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 429,
        data: { code: "reset_rate_limited" },
      } as AxiosResponse),
    );
    render(<ForgotPasswordPage />);
    submit("ada@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(ANSWER);
  });

  it("says so when the server cannot be reached, and keeps the form", async () => {
    request.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    render(<ForgotPasswordPage />);
    submit("ada@example.com");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("cannot be reached"));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
