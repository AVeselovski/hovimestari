import { NO_FLASH_SCRIPT, THEME_STORAGE_KEY } from "../theme/noFlashScript";

// Runs the pre-paint script as the browser would, before any React code, and
// reads what it wrote on <html>.

function stubScheme(dark: boolean): void {
  window.matchMedia = jest.fn().mockReturnValue({ matches: dark }) as unknown as typeof window.matchMedia;
}

function run(): { theme?: string; mode?: string } {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
  new Function(NO_FLASH_SCRIPT)();
  return { theme: document.documentElement.dataset.theme, mode: document.documentElement.dataset.themeMode };
}

beforeEach(() => window.localStorage.clear());

describe("the pre-paint theme script", () => {
  it("follows the device when nothing is stored", () => {
    stubScheme(true);
    expect(run()).toEqual({ theme: "dark", mode: "system" });
    stubScheme(false);
    expect(run()).toEqual({ theme: "light", mode: "system" });
  });

  it("applies a stored choice whatever the device prefers", () => {
    stubScheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(run()).toEqual({ theme: "light", mode: "light" });
    stubScheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(run()).toEqual({ theme: "dark", mode: "dark" });
  });

  it("treats a value it does not know as following the device", () => {
    stubScheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(run()).toEqual({ theme: "dark", mode: "system" });
  });

  it("paints light when storage throws", () => {
    stubScheme(true);
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(run()).toEqual({ theme: "light", mode: "system" });
    getItem.mockRestore();
  });

  it("uses the app's own storage key", () => {
    expect(NO_FLASH_SCRIPT).toContain(`"${THEME_STORAGE_KEY}"`);
    expect(THEME_STORAGE_KEY).toBe("hovi-theme");
  });
});
