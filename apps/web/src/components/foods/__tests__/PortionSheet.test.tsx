import { describeFormSheetContract } from "@/__tests__/formSheet";
import { confirmArmed } from "@/__tests__/sheet";
import { addPortion, deletePortion, updatePortion } from "@/lib/api/foods";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PortionSheet, type PortionSheetProps } from "../PortionSheet";
import { ownPortion, refusal, uuid } from "./support";

jest.mock("@/lib/api/foods", () => ({ addPortion: jest.fn(), updatePortion: jest.fn(), deletePortion: jest.fn() }));

const FOOD = uuid();
const tub = ownPortion("Purkki", 200);

beforeEach(() => {
  jest.mocked(addPortion).mockReset().mockResolvedValue(tub);
  jest.mocked(updatePortion).mockReset().mockResolvedValue(tub);
  jest.mocked(deletePortion).mockReset().mockResolvedValue(undefined);
});

const dialog = () => screen.getByRole("dialog", { name: /portion/i });
const input = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const lineOf = (label: string) => document.getElementById(`${input(label).id}-line`);
const save = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));

function renderSheet(props: Partial<PortionSheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSaved: jest.fn(), onDeleted: jest.fn() };
  render(<PortionSheet open returnFocusTo={null} foodId={FOOD} {...handlers} {...props} />);
  return handlers;
}

describe("PortionSheet", () => {
  describeFormSheetContract({
    name: /add a portion/i,
    renderSheet: (p) => <PortionSheet {...p} foodId={FOOD} />,
    type: () => type("Name", "Purkki"),
    typedField: () => input("Name"),
    fillValid: () => {
      type("Name", "Purkki");
      type("Weight", "200");
    },
    holdSave: () => {
      let resolve: () => void = () => {};
      let reject: () => void = () => {};
      jest.mocked(addPortion).mockReturnValue(
        new Promise((res, rej) => {
          resolve = () => res(tub);
          reject = () => rej(refusal(500, "internal_error"));
        }),
      );
      return { resolve, reject };
    },
    firstField: () => input("Name"),
  });

  it("opens empty with no placeholder, and adds a portion with a decimal weight", async () => {
    const { onClose } = renderSheet();
    expect(input("Name")).toHaveValue("");
    expect(input("Weight")).toHaveValue("");
    expect(input("Weight")).not.toHaveAttribute("placeholder");
    type("Name", " Purkki ");
    type("Weight", "202,5");
    save();
    await waitFor(() => expect(addPortion).toHaveBeenCalledWith(FOOD, { name: "Purkki", grams: 202.5 }));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps one line of room under each field, and shows why a value is refused", async () => {
    renderSheet();
    type("Weight", "6000");
    save();
    expect(lineOf("Name")).toHaveTextContent("Give the portion a name.");
    expect(lineOf("Weight")).toHaveTextContent("Enter 0.1 to 5000 g, one decimal at most.");
    for (const label of ["Name", "Weight"]) expect(lineOf(label)!.className.split(" ")).toContain("min-h-5");
    // The first submit's promise settles before the second press, as it does between two taps.
    await act(async () => {});
    type("Weight", "1.500");
    save();
    expect(lineOf("Weight")).toHaveTextContent("No comma or point, or fewer decimals.");
    expect(addPortion).not.toHaveBeenCalled();
  });

  it("edits the user's own portion and deletes it after asking", async () => {
    const { onDeleted } = renderSheet({ portion: tub });
    expect(screen.getByRole("dialog", { name: "Edit portion" })).toBeInTheDocument();
    expect(input("Name")).toHaveValue("Purkki");
    expect(input("Weight")).toHaveValue("200");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this portion?" });
    expect(confirm).toHaveTextContent("This removes “Purkki” from the food's portions.");
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletePortion).toHaveBeenCalledWith(FOOD, tub.id));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("ignores Delete while a save runs", async () => {
    let resolve: () => void = () => {};
    jest.mocked(updatePortion).mockReturnValue(new Promise((r) => (resolve = () => r(tub))));
    renderSheet({ portion: tub });
    type("Weight", "210");
    save();
    const del = within(dialog()).getByRole("button", { name: "Delete" });
    await waitFor(() => expect(del).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(del);
    expect(screen.queryByRole("dialog", { name: "Delete this portion?" })).toBeNull();
    await act(async () => resolve());
  });

  it("shows a portion that is gone as a line under the form", async () => {
    jest.mocked(updatePortion).mockRejectedValue(refusal(404, "portion_not_found"));
    renderSheet({ portion: tub });
    type("Weight", "210");
    save();
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("This portion is no longer available.");
  });
});
