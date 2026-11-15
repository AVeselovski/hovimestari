import { useAuth } from "@/contexts/AuthContext";
import { render, screen } from "@testing-library/react";
import { AuthGuard } from "../AuthGuard";

const mockReplace = jest.fn();

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function makeAuth(status: "loading" | "authenticated" | "unauthenticated") {
  return {
    user:
      status === "authenticated"
        ? { id: "1", email: "u@example.com", displayName: "User", hasPassword: true, hasGoogle: false }
        : null,
    accessToken: status === "authenticated" ? "token" : null,
    status,
    login: jest.fn(),
    logout: jest.fn(),
    silentRefresh: jest.fn(),
    setAccessToken: jest.fn(),
    refreshUser: jest.fn(),
  };
}

beforeEach(() => {
  mockReplace.mockReset();
});

describe("AuthGuard", () => {
  it("renders children when authenticated", () => {
    mockUseAuth.mockReturnValue(makeAuth("authenticated"));
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("renders a loading spinner when status is loading", () => {
    mockUseAuth.mockReturnValue(makeAuth("loading"));
    const { container } = render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    // Spinner is present (rendered as an animated div)
    expect(container.querySelector('[class*="animate"]')).toBeInTheDocument();
  });

  it("redirects to sign-in when unauthenticated", () => {
    mockUseAuth.mockReturnValue(makeAuth("unauthenticated"));
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in");
  });
});
