import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { ConnectionRevealProvider } from "@/components/ConnectionRevealProvider";
import { useAuth } from "@/contexts/AuthContext";
import { injectAuthHandlers } from "@/lib/api";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConnectedAiSection } from "../_components/ConnectedAiSection";

// ---------------------------------------------------------------------------
// What the Connected AI suites share. Each suite mocks `@/contexts/AuthContext`
// and `next/navigation` itself (jest hoists those per file), installs the
// fake `/connections` server and calls `startConnectedAiTest()` first.
//
// Every date is read on the account's zone (Europe/Helsinki) and in a British
// English device, so the dates read "19 December 2026".
// ---------------------------------------------------------------------------

export const NOW = "2026-11-19T10:00:00.000Z";

/** The clock, the device's language, a signed-in person and no token. */
export function startConnectedAiTest(): void {
  clockFrom(NOW);
  setTestLocale("en-GB");
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  injectAuthHandlers({ getAccessToken: () => null, renewSession: async () => false });
}

export function renderSection(): ReturnType<typeof render> {
  return render(
    <ConnectionRevealProvider>
      <ConnectedAiSection />
    </ConnectionRevealProvider>,
  );
}

// Found even while a sheet hides the page from readers (`hidden: true`), so a
// test can look behind the create sheet or the reveal. A test that checks
// what a reader can reach queries without it.
export const section = (): HTMLElement => screen.getByRole("region", { name: "Connected AI", hidden: true });

export const rowOf = (name: string): HTMLElement => {
  const heading = within(section()).getByRole("heading", { name, level: 3, hidden: true });
  const row = heading.closest("li");
  if (!row) throw new Error(`No row for ${name}`);
  return row;
};

/** Fills the create form with a name and the tick, as a person would. */
export function fillCreate(dialog: HTMLElement, name: string): void {
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: name } });
  fireEvent.click(within(dialog).getByRole("checkbox"));
}

/** Presses Connect an assistant once the list is in, and returns the create sheet. */
export async function openCreate(): Promise<HTMLElement> {
  fireEvent.click(await within(section()).findByRole("button", { name: "Connect an assistant" }));
  return screen.findByRole("dialog", { name: "Connect an assistant" });
}

/** Makes a key through the create sheet and returns the reveal. */
export async function makeKey(name = "Laptop"): Promise<HTMLElement> {
  const dialog = await openCreate();
  fillCreate(dialog, name);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
  return screen.findByRole("dialog", { name: "Your key" });
}
