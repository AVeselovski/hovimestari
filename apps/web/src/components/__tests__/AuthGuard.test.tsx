import { useAuth } from "@/contexts/AuthContext";
import { fireEvent, render, screen } from "@testing-library/react";
import { fakeAuth } from "../../__tests__/helpers/auth";
import { AuthGuard } from "../AuthGuard";

const mockReplace = jest.fn();
let mockPathname = "/";

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

const mockUseAuth = jest.mocked(useAuth);

function renderGuard(): void {
  render(
    <AuthGuard>
      <p>Protected content</p>
    </AuthGuard>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockPathname = "/";
  localStorage.clear();
});

describe("AuthGuard", () => {
  it("renders the app when authenticated", () => {
    mockUseAuth.mockReturnValue(fakeAuth("authenticated"));
    renderGuard();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders the app offline on a device with a known session, and sends nobody away", () => {
    localStorage.setItem("hovi-signed-in", "1");
    mockUseAuth.mockReturnValue(fakeAuth("offline"));
    renderGuard();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows the guest side offline on a device that was signed out", () => {
    mockUseAuth.mockReturnValue(fakeAuth("offline"));
    renderGuard();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not signed in" })).toBeInTheDocument();
    // Said once, by the offline line, not again by the title.
    expect(screen.getAllByText(/offline/i).map((el) => el.textContent)).toEqual(["You are offline."]);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("offers a retry and keeps the app hidden when the server answered with a fault", () => {
    localStorage.setItem("hovi-signed-in", "1");
    const retry = jest.fn();
    mockUseAuth.mockReturnValue(fakeAuth("error", { retry }));
    renderGuard();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("You are offline.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("could not check your session");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends a person who just signed out to plain sign-in, without a redirect", () => {
    mockPathname = "/settings";
    mockUseAuth.mockReturnValue(fakeAuth("unauthenticated", { signedOut: true }));
    renderGuard();
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in");
  });

  // The sign-out already went to its page. The guard must not replace it with
  // plain sign-in, which would drop the note.
  it("after a sign-out with a note, keeps the person on the page with the note", () => {
    mockPathname = "/settings";
    mockUseAuth.mockReturnValue(
      fakeAuth("unauthenticated", { signedOut: true, afterSignOut: "/auth/sign-in?deleted=1" }),
    );
    renderGuard();
    expect(mockReplace.mock.calls).toEqual([["/auth/sign-in?deleted=1"]]);
  });

  it("shows the spinner while the session is restored", () => {
    mockUseAuth.mockReturnValue(fakeAuth("loading"));
    renderGuard();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("sends a visitor without a session to sign-in", () => {
    mockUseAuth.mockReturnValue(fakeAuth("unauthenticated"));
    renderGuard();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("asks sign-in to bring the visitor back to the tab they opened", () => {
    mockPathname = "/settings";
    mockUseAuth.mockReturnValue(fakeAuth("unauthenticated"));
    renderGuard();
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in?redirect=%2Fsettings");
  });
});
