import { describeFormSheetContract, stubPhone } from "@/__tests__/formSheet";
import { DeleteAccountSheet } from "@/components/account/DeleteAccountSheet";
import { useAuth } from "@/contexts/AuthContext";
import { addPassword } from "@/lib/api/auth";
import { changePassword, deleteAccount } from "@/lib/api/users";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { TEST_USER, fakeAuth, testPassword } from "../../../../__tests__/helpers/auth";
import { AddPasswordSheet } from "../_components/AddPasswordSheet";
import { ChangePasswordSheet } from "../_components/ChangePasswordSheet";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/users", () => ({ changePassword: jest.fn(), deleteAccount: jest.fn(), getMe: jest.fn() }));
jest.mock("@/lib/api/auth", () => ({ addPassword: jest.fn() }));

const signIn = jest.fn();
const signOut = jest.fn();
beforeEach(() => {
  signIn.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { signIn, signOut }));
  jest.mocked(changePassword).mockReset().mockResolvedValue(undefined);
  jest.mocked(deleteAccount).mockReset().mockResolvedValue(undefined);
  jest
    .mocked(addPassword)
    .mockReset()
    .mockResolvedValue({ ...TEST_USER, hasGoogle: true });
});

/** A refusal from the API with an error code, as axios rejects. */
function refusal(status: number, code: string): AxiosError {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { message: "Server text.", code },
  } as AxiosResponse);
}

/** A promise the test settles. */
function held<T>(mock: jest.Mock): { resolve: () => void; reject: () => void } {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  mock.mockReturnValue(
    new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { resolve: () => resolve(undefined as T), reject: () => reject(new Error("refused")) };
}

const field = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string): void => {
  fireEvent.change(field(label), { target: { value } });
};

describe("ChangePasswordSheet", () => {
  describeFormSheetContract({
    name: /change password/i,
    renderSheet: (p) => <ChangePasswordSheet email={TEST_USER.email} {...p} />,
    type: () => type("Current password", "something"),
    typedField: () => field("Current password"),
    fillValid: () => {
      type("Current password", testPassword());
      type("New password", testPassword());
    },
    holdSave: () => held(jest.mocked(changePassword)),
    firstField: () => field("Current password"),
  });

  function renderOpen(): { onSaved: jest.Mock; onClose: jest.Mock } {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    render(
      <ChangePasswordSheet open email={TEST_USER.email} returnFocusTo={null} onClose={onClose} onSaved={onSaved} />,
    );
    return { onSaved, onClose };
  }

  it("changes the password, then signs this device straight back in with the new one", async () => {
    const { onSaved, onClose } = renderOpen();
    const current = testPassword();
    const next = testPassword();
    type("Current password", current);
    type("New password", next);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: current, newPassword: next });
    expect(signIn).toHaveBeenCalledWith({ email: TEST_USER.email, password: next });
    expect(jest.mocked(changePassword).mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("when signing back in fails, signs this device out to the sign-in page with its note", async () => {
    signIn.mockRejectedValue(new TypeError("offline"));
    const { onSaved } = renderOpen();
    type("Current password", testPassword());
    type("New password", testPassword());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ to: "/auth/sign-in?reset=1" }));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("puts a wrong current password under its field and keeps the sheet open", async () => {
    jest.mocked(changePassword).mockRejectedValue(refusal(401, "current_password_wrong"));
    const { onClose } = renderOpen();
    type("Current password", testPassword());
    type("New password", testPassword());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The current password is incorrect.")).toBeInTheDocument();
    expect(field("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(field("Current password")).toHaveFocus();
    expect(signIn).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Server text.")).not.toBeInTheDocument();
  });

  it("checks the fields before it calls the server", async () => {
    renderOpen();
    type("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter your current password.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows a refusal that belongs to no field in the form's own line", async () => {
    jest.mocked(changePassword).mockRejectedValue(refusal(429, "password_rate_limited"));
    renderOpen();
    type("Current password", testPassword());
    type("New password", testPassword());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The alert line is on the page before its text: wait for the text itself.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again in 15 minutes."),
    );
  });
});

describe("AddPasswordSheet", () => {
  describeFormSheetContract({
    name: /add a password/i,
    renderSheet: (p) => <AddPasswordSheet email={TEST_USER.email} {...p} />,
    type: () => type("New password", "something"),
    typedField: () => field("New password"),
    fillValid: () => type("New password", testPassword()),
    holdSave: () => held(jest.mocked(addPassword)),
    firstField: () => field("New password"),
  });

  it("adds the password and hands the account back", async () => {
    const onSaved = jest.fn();
    render(
      <AddPasswordSheet open email={TEST_USER.email} returnFocusTo={null} onClose={jest.fn()} onSaved={onSaved} />,
    );
    const password = testPassword();
    type("New password", password);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...TEST_USER, hasGoogle: true }));
    expect(addPassword).toHaveBeenCalledWith({ password });
  });

  it("puts a password the server finds too long under its field", async () => {
    jest.mocked(addPassword).mockRejectedValue(refusal(400, "password_too_long"));
    render(
      <AddPasswordSheet open email={TEST_USER.email} returnFocusTo={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    type("New password", testPassword());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(field("New password")).toHaveAttribute("aria-invalid", "true"));
    expect(field("New password")).toHaveFocus();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("says nothing about other devices", () => {
    render(
      <AddPasswordSheet open email={TEST_USER.email} returnFocusTo={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/device/i);
  });
});

describe("DeleteAccountSheet", () => {
  describeFormSheetContract({
    name: /delete your account/i,
    renderSheet: (p) => <DeleteAccountSheet me={{ hasPassword: true }} {...p} />,
    type: () => type("Password", "something"),
    typedField: () => field("Password"),
    fillValid: () => type("Password", testPassword()),
    holdSave: () => held(jest.mocked(deleteAccount)),
    firstField: () => field("Password"),
    saveName: /^delete account$/i,
    busyName: /deleting/i,
  });

  function renderOpen(hasPassword: boolean): { onSaved: jest.Mock } {
    const onSaved = jest.fn();
    render(<DeleteAccountSheet open me={{ hasPassword }} returnFocusTo={null} onClose={jest.fn()} onSaved={onSaved} />);
    return { onSaved };
  }

  it("confirms a password account with its password", async () => {
    const { onSaved } = renderOpen(true);
    const password = testPassword();
    type("Password", password);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(deleteAccount).toHaveBeenCalledWith({ password });
  });

  it("confirms a Google-only account by its typed email address", async () => {
    const { onSaved } = renderOpen(false);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    type("Type your email to confirm", TEST_USER.email);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(deleteAccount).toHaveBeenCalledWith({ email: TEST_USER.email });
  });

  it("keeps Delete disabled until the confirmation is filled", () => {
    renderOpen(true);
    const button = screen.getByRole("button", { name: "Delete account" });
    expect(button).toBeDisabled();
    type("Password", "   ");
    expect(button).toBeDisabled();
    type("Password", testPassword());
    expect(button).toBeEnabled();
  });

  it.each([
    [true, "Password", "That password is not right. Check it and try again."],
    [false, "Type your email to confirm", "That is not this account's email. Check it and try again."],
  ])(
    "with a password %s, says what did not match under the field and deletes nothing",
    async (hasPassword, label, line) => {
      jest.mocked(deleteAccount).mockRejectedValue(refusal(400, "confirmation_mismatch"));
      const { onSaved } = renderOpen(hasPassword);
      type(label, hasPassword ? testPassword() : "someone@example.test");
      fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
      expect(await screen.findByText(line)).toBeInTheDocument();
      expect(field(label)).toHaveAttribute("aria-invalid", "true");
      expect(field(label)).toHaveFocus();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it("deletes once when Enter submits again while the deletion runs", async () => {
    held(jest.mocked(deleteAccount));
    renderOpen(true);
    type("Password", testPassword());
    const button = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Deleting…" });
    fireEvent.submit(button.form!);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  // On a phone the sheet slides up under the finger that opened it. A second
  // tap of a double tap, or any press before the sheet is at rest, must not
  // delete. jsdom plays no animation, so here the sheet never reports it is
  // at rest unless the test lets it.
  it("on a phone, takes no press until the sheet is at rest, filled or not", async () => {
    const restorePhone = stubPhone();
    try {
      const { controlSheetAnimations } = await import("@/__tests__/sheet");
      const animations = controlSheetAnimations();
      try {
        renderOpen(true);
        type("Password", testPassword());
        const button = screen.getByRole("button", { name: "Delete account" });
        fireEvent.pointerDown(button);
        fireEvent.click(button);
        fireEvent.submit((button as HTMLButtonElement).form!);
        await act(() => new Promise((r) => setTimeout(r, 600)));
        expect(deleteAccount).not.toHaveBeenCalled();

        await act(async () => animations.finish());
        await waitFor(() => expect(button).toHaveAttribute("data-press-guard", "armed"));
        fireEvent.pointerDown(button);
        fireEvent.click(button);
        await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
      } finally {
        animations.restore();
      }
    } finally {
      restorePhone();
    }
  });
});
