import { fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "../../app/error";

describe("the error page", () => {
  it("says what happened, offers a retry and the way home", () => {
    const reset = jest.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This page could not be shown.");
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Go to the Day tab" })).toHaveAttribute("href", "/");
  });
});
