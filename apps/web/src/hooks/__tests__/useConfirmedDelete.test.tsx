import { confirmArmed } from "@/__tests__/sheet";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";

interface Item {
  id: string;
  name: string;
}

const ITEMS: Item[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];

/**
 * A list whose rows leave the page once their delete lands, like a refetch
 * would, with a search field above it as the fallback target.
 */
function List({ run, initial = ITEMS }: { run: (item: Item) => Promise<unknown>; initial?: Item[] }) {
  const [items, setItems] = useState(initial);
  const searchRef = useRef<HTMLInputElement>(null);
  const del = useConfirmedDelete<Item>({
    copy: (item) => ({ title: `Delete ${item.name}`, message: "It goes for good." }),
    run,
    onDone: (_r, item) => setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), 0),
    focusFallback: () => searchRef.current,
  });
  return (
    <div>
      <input ref={searchRef} aria-label="Search" />
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" aria-label={`Delete ${item.name}`} onClick={(e) => del.open(item, e.currentTarget)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {del.dialog}
    </div>
  );
}

async function openFor(name: string): Promise<HTMLElement> {
  // fireEvent.click focuses nothing, like a tap on an iPhone: the dialog
  // cannot capture its opener and has to be told.
  fireEvent.click(screen.getByRole("button", { name: `Delete ${name}` }));
  const dialog = await screen.findByRole("dialog", { name: `Delete ${name}` });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  return dialog;
}

describe("useConfirmedDelete", () => {
  it("Cancel returns focus to the button that opened it, though a tap never focused it", async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    render(<List run={run} />);
    expect(document.activeElement).toBe(document.body);
    const dialog = await openFor("Alpha");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete Alpha" })).toHaveFocus());
    expect(run).not.toHaveBeenCalled();
  });

  it("a failure stays inside the dialog with the catalog's line for its code, and pressing again retries", async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { message: "Server text.", code: "last_sign_in_method" } },
      })
      .mockResolvedValueOnce(undefined);
    render(<List run={run} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("You cannot remove your only way to sign in.");
    expect(alert).not.toHaveTextContent("Server text.");
    expect(screen.getByRole("dialog")).toBe(dialog);
    const button = within(dialog).getByRole("button", { name: "Delete" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("a failure with no code of its own says the generic line", async () => {
    render(<List run={jest.fn().mockRejectedValue({})} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });

  it("opens fresh: a reopened dialog does not show the last attempt's failure", async () => {
    render(<List run={jest.fn().mockRejectedValue({})} />);
    let dialog = await openFor("Alpha");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    dialog = await openFor("Alpha");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("after a delete focus moves to the next row and stays there once the deleted row leaves", async () => {
    render(<List run={jest.fn().mockResolvedValue(undefined)} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete Alpha" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete Beta" })).toHaveFocus();
  });

  it("after deleting the only row focus moves to the focusFallback", async () => {
    render(<List run={jest.fn().mockResolvedValue(undefined)} initial={[ITEMS[0]]} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete Alpha" })).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
  });

  it("stays busy while it slides out after a delete, so its button never flashes back", async () => {
    let land: () => void = () => {};
    const run = jest.fn(() => new Promise<void>((resolve) => (land = resolve)));
    render(<List run={run} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const button = within(dialog).getByRole("button", { name: "Deleting…" });
    expect(button).toBeDisabled();

    await act(async () => land());

    // Closing, or gone: never enabled again on the way out.
    if (dialog.isConnected) expect(button).toBeDisabled();
  });

  it("runs the write once for two presses in the same tick, before the busy state renders", async () => {
    const run = jest.fn(() => new Promise<void>(() => {}));
    render(<List run={run} />);
    const dialog = await openFor("Alpha");
    await confirmArmed();
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    act(() => {
      // One act: React renders nothing between the two, so the button is still enabled for the second.
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("tells the caller about a failure, with the error and the target, and not about a success", async () => {
    const refusal = new Error("refused");
    const onError = jest.fn();
    const run = jest.fn().mockRejectedValueOnce(refusal).mockResolvedValueOnce(undefined);
    function Caller() {
      const del = useConfirmedDelete<Item>({
        copy: (item) => ({ title: `Delete ${item.name}`, message: "It goes for good." }),
        run,
        onError,
      });
      return (
        <>
          <button type="button" aria-label="Delete Alpha" onClick={(e) => del.open(ITEMS[0], e.currentTarget)}>
            Delete
          </button>
          {del.dialog}
        </>
      );
    }
    render(<Caller />);
    const dialog = await openFor("Alpha");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(refusal, ITEMS[0]));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("two confirmations on one page never share a key, so each returns focus to its own opener", async () => {
    // The Buckets page renders its bucket and category confirmations side by
    // side. Each counts its opens from 1, so without a key of its own the two
    // collide and the second one's Cancel hands focus to the first one's opener.
    function TwoKinds() {
      const options = { run: jest.fn() };
      const first = useConfirmedDelete<string>({
        ...options,
        copy: (n) => ({ title: `Delete ${n}`, message: "Gone." }),
      });
      const second = useConfirmedDelete<string>({
        ...options,
        copy: (n) => ({ title: `Remove ${n}`, message: "Gone." }),
      });
      return (
        <div>
          <button type="button" onClick={(e) => first.open("bucket", e.currentTarget)}>
            Bucket menu
          </button>
          <button type="button" onClick={(e) => second.open("category", e.currentTarget)}>
            Category menu
          </button>
          {first.dialog}
          {second.dialog}
        </div>
      );
    }
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<TwoKinds />);
      // Held from here on: while a dialog is open the page behind it is hidden from role queries.
      const bucketMenu = screen.getByRole("button", { name: "Bucket menu" });
      const categoryMenu = screen.getByRole("button", { name: "Category menu" });
      fireEvent.click(bucketMenu);
      let dialog = await screen.findByRole("dialog", { name: "Delete bucket" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(bucketMenu).toHaveFocus());

      // A tap focuses nothing, so focus is still on the first opener when the
      // second dialog opens. Cancel goes in the same tick, before the dialog's
      // own first focus (a frame later) has moved focus inside.
      fireEvent.click(categoryMenu);
      dialog = screen.getByRole("dialog", { name: "Remove category" });
      expect(bucketMenu).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(categoryMenu).toHaveFocus();
      // And it stays there once the frames the dialogs had queued have run.
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(categoryMenu).toHaveFocus();
      const duplicateKeys = errors.mock.calls.filter((call) => String(call[0]).includes("same key"));
      expect(duplicateKeys).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
