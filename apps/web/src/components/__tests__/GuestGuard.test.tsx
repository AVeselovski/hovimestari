import { useAuth } from "@/contexts/AuthContext";
import { render, screen } from "@testing-library/react";
import { fakeAuth } from "../../__tests__/helpers/auth";
import { GuestGuard, POST_LOGIN_REDIRECT_KEY } from "../GuestGuard";

const mockReplace = jest.fn();
jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));
const mockUseAuth = jest.mocked(useAuth);

function visit(search: string): void {
  window.history.replaceState(null, "", `/auth/sign-in${search}`);
}

function renderGuard(): void {
  render(
    <GuestGuard>
      <p>Sign-in form</p>
    </GuestGuard>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  sessionStorage.clear();
  visit("");
});

describe("GuestGuard", () => {
  it("shows the guest page to a visitor without a session", () => {
    mockUseAuth.mockReturnValue(fakeAuth("unauthenticated"));
    renderGuard();
    expect(screen.getByText("Sign-in form")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends a signed-in visitor to the Day tab", () => {
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(screen.queryByText("Sign-in form")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("keeps the query and hash of a path on this site", () => {
    visit(`?redirect=${encodeURIComponent("/settings?google=linked#account")}`);
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(mockReplace).toHaveBeenCalledWith("/settings?google=linked#account");
  });

  it("honours a path on this site from ?redirect=", () => {
    visit("?redirect=%2Fsettings");
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(mockReplace).toHaveBeenCalledWith("/settings");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    // The URL parser strips tabs and newlines, so these become //evil.example.
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\t\\evil.example",
  ])("refuses the redirect %j", (target) => {
    visit(`?redirect=${encodeURIComponent(target)}`);
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("uses the destination saved before Google, once, and refuses a saved //evil", () => {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "/recipes");
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(mockReplace).toHaveBeenLastCalledWith("/recipes");
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();

    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "//evil.example");
    renderGuard();
    expect(mockReplace).toHaveBeenLastCalledWith("/");

    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "/\t/evil.example");
    renderGuard();
    expect(mockReplace).toHaveBeenLastCalledWith("/");
  });
});
