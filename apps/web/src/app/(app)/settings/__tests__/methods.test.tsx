import { confirmArmed } from "@/__tests__/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { addPassword, getProviders, removeSignInMethod, startGoogleLink } from "@/lib/api/auth";
import { getMe } from "@/lib/api/users";
import { queryKeys } from "@/lib/queryKeys";
import type { Me } from "@hovimestari/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { TEST_USER, fakeAuth, testPassword } from "../../../../__tests__/helpers/auth";
import { createTestQueryClient, queryWrapper } from "../../../../__tests__/helpers/queryClient";
import { SignInMethods, SignInMethodsSection } from "../_components/SignInMethodsSection";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/auth", () => ({
  getProviders: jest.fn(),
  removeSignInMethod: jest.fn(),
  startGoogleLink: jest.fn(),
  addPassword: jest.fn(),
}));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), changePassword: jest.fn() }));
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const BOTH: Me = { ...TEST_USER, hasPassword: true, hasGoogle: true };
const GOOGLE_ONLY: Me = { ...TEST_USER, hasPassword: false, hasGoogle: true };
const PASSWORD_ONLY: Me = { ...TEST_USER, hasPassword: true, hasGoogle: false };

const assign = jest.fn();
beforeAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, search: "" },
  });
});

function setSearch(search: string): void {
  (window.location as { search: string }).search = search;
}

beforeEach(() => {
  setSearch("");
  assign.mockReset();
  mockReplace.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getProviders).mockReset().mockResolvedValue({ google: true });
  jest.mocked(getMe).mockReset().mockResolvedValue(TEST_USER);
  jest.mocked(removeSignInMethod).mockReset();
  jest.mocked(startGoogleLink).mockReset();
});

const methods = (): HTMLElement => screen.getByRole("region", { name: "Sign-in methods" });
const row = (name: string): HTMLElement => within(methods()).getByRole("group", { name });

describe("the sign-in methods", () => {
  it("shows each method's state", async () => {
    render(<SignInMethods me={PASSWORD_ONLY} />);
    expect(row("Password")).toHaveTextContent("Set");
    expect(await within(methods()).findByRole("group", { name: "Google" })).toHaveTextContent("Not connected");
  });

  it("offers Remove password and Unlink Google only while both methods exist", async () => {
    const { unmount } = render(<SignInMethods me={BOTH} />);
    await screen.findByRole("group", { name: "Google" });
    expect(screen.getByRole("button", { name: "Remove password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlink Google" })).toBeInTheDocument();
    unmount();

    for (const me of [PASSWORD_ONLY, GOOGLE_ONLY]) {
      const view = render(<SignInMethods me={me} />);
      await screen.findByRole("group", { name: "Google" });
      expect(screen.queryByRole("button", { name: "Remove password" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Unlink Google" })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("offers Change password with a password and Add password without one", async () => {
    const { unmount } = render(<SignInMethods me={PASSWORD_ONLY} />);
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add password" })).not.toBeInTheDocument();
    unmount();
    render(<SignInMethods me={GOOGLE_ONLY} />);
    expect(screen.getByRole("button", { name: "Add password" })).toBeInTheDocument();
  });

  it("leaves Google out while this deployment does not offer it and the account has none", async () => {
    jest.mocked(getProviders).mockResolvedValue({ google: false });
    render(<SignInMethods me={PASSWORD_ONLY} />);
    await waitFor(() => expect(getProviders).toHaveBeenCalled());
    expect(within(methods()).queryByRole("group", { name: "Google" })).not.toBeInTheDocument();
  });

  it("removes the password after the confirmation, and says so", async () => {
    jest.mocked(removeSignInMethod).mockResolvedValue({ ...BOTH, hasPassword: false });
    render(<SignInMethods me={BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove password" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove your password?" });
    expect(dialog).toHaveTextContent("You will sign in with Google only.");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove password" }));
    await waitFor(() => expect(removeSignInMethod).toHaveBeenCalledWith("password"));
    expect(await screen.findByRole("status")).toHaveTextContent("Password removed. You sign in with Google.");
  });

  it("keeps the dialog open with the catalog's line when the server refuses", async () => {
    jest.mocked(removeSignInMethod).mockRejectedValue(
      new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { code: "last_sign_in_method" },
      } as AxiosResponse),
    );
    render(<SignInMethods me={BOTH} />);
    fireEvent.click(await screen.findByRole("button", { name: "Unlink Google" }));
    const dialog = await screen.findByRole("dialog", { name: "Unlink Google?" });
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink Google" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You cannot remove your only way to sign in.");
  });

  // Another tab or device removed the password first: the server refuses the
  // unlink, and the rows here must stop offering what is no longer there.
  it("reads the account again after a refusal that says the other method is gone", async () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { user: BOTH }));
    jest.mocked(getMe).mockResolvedValueOnce(BOTH).mockResolvedValue(GOOGLE_ONLY);
    jest.mocked(removeSignInMethod).mockRejectedValue(
      new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { code: "last_sign_in_method" },
      } as AxiosResponse),
    );
    render(<SignInMethodsSection />);
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Unlink Google" }));
    const dialog = await screen.findByRole("dialog", { name: "Unlink Google?" });
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink Google" }));
    await within(dialog).findByRole("alert");
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(row("Password")).toHaveTextContent("Not set"));
    expect(screen.queryByRole("button", { name: "Remove password" })).not.toBeInTheDocument();
  });

  it("after Add password, puts focus on the password row, since its button changes", async () => {
    jest.mocked(addPassword).mockResolvedValue(BOTH);
    render(<SignInMethods me={GOOGLE_ONLY} />);
    fireEvent.click(screen.getByRole("button", { name: "Add password" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a password" });
    fireEvent.change(within(dialog).getByLabelText("New password"), { target: { value: testPassword() } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(row("Password")).toHaveFocus());
  });
});

describe("linking Google", () => {
  it("starts the link and leaves for Google's consent address", async () => {
    jest.mocked(startGoogleLink).mockResolvedValue({ url: "https://accounts.google.test/consent" });
    render(<SignInMethods me={PASSWORD_ONLY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Link Google account" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.test/consent"));
    expect(screen.getByRole("button", { name: "Opening Google…" })).toBeDisabled();
  });

  it("says why a start failed and lets the person try again", async () => {
    jest.mocked(startGoogleLink).mockRejectedValue(new AxiosError("down", "ERR_NETWORK"));
    render(<SignInMethods me={PASSWORD_ONLY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Link Google account" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Hovimestari cannot be reached right now. Try again in a moment.",
    );
    expect(screen.getByRole("button", { name: "Link Google account" })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ["linked", "Google is connected."],
    ["taken", "That Google account is already linked to another account."],
    ["already", "Google is already connected to this account."],
    ["failed", "Google could not be connected. Try again."],
  ])("?google=%s says its line and is taken off the address", async (result, line) => {
    setSearch(`?google=${result}`);
    render(<SignInMethods me={PASSWORD_ONLY} />);
    expect(await screen.findByRole("status")).toHaveTextContent(line);
    expect(mockReplace).toHaveBeenCalledWith("/settings");
  });

  // The cache may still hold the account from before the link: `linked`
  // reads it again, and the row follows that second read.
  it("after a link, reads the account again and shows Google from the second read", async () => {
    setSearch("?google=linked");
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated", { user: PASSWORD_ONLY }));
    jest.mocked(getMe).mockResolvedValue(BOTH);
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.me(), PASSWORD_ONLY);
    render(<SignInMethodsSection />, { wrapper: queryWrapper(client) });
    expect(await screen.findByRole("status")).toHaveTextContent("Google is connected.");
    await waitFor(() => expect(row("Google")).toHaveTextContent("Connected"));
    expect(row("Google")).not.toHaveTextContent("Not connected");
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it("shows nothing until the account is known", () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline"));
    render(<SignInMethodsSection />);
    expect(screen.queryByRole("region", { name: "Sign-in methods" })).not.toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });

  it("ignores a result it does not know, and still cleans the address", async () => {
    setSearch("?google=<script>");
    render(<SignInMethods me={PASSWORD_ONLY} />);
    expect(mockReplace).toHaveBeenCalledWith("/settings");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
