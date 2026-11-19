/** @jest-environment node */
import { readFileSync } from "node:fs";
import type { ZXingModuleOverrides } from "zxing-wasm/reader";
import { loadDecoder } from "../decoder";

// The order of a failed load's purge, with the real library. The library
// keeps one module and the overrides it was built with, and a purge drops
// it. A load that starts after the stored load is released builds its own
// module. Were the failed load's purge to run after that release, it could
// drop the new load's module, and the next read would build one with the
// library's defaults, which fetch the wasm from a CDN. So the purge must run
// while the failed load is still held: `loadDecoder` called at that moment
// hands back the failed load and starts nothing. The purge is watched, not
// replaced, so the real one runs. In its own file, because the library's
// module is shared by everything in one test file.

// The library's own exports, before decoder.ts first imports them, so the watch is what it calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const library = require("zxing-wasm/reader") as typeof import("zxing-wasm/reader");

const wasm = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"));

/** Overrides that compile the wasm from its bytes, or fail as a dropped download does. */
function compiled(fail: boolean): ZXingModuleOverrides {
  return {
    instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
      if (fail) throw new Error("no wasm");
      const source: BufferSource = new Uint8Array(wasm);
      void WebAssembly.instantiate(source, imports).then(({ instance }) => done(instance));
      return {};
    },
  } as ZXingModuleOverrides;
}

it("purges a failed module while the failed load is still held, so no later load loses its module", async () => {
  // A fetch is the one thing a read must never need: the app's overrides compile from bytes here.
  const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in a test"));
  const heldAtPurge: boolean[] = [];
  const purge = library.purgeZXingModule;
  const purgeSpy = jest.spyOn(library, "purgeZXingModule").mockImplementation(() => {
    heldAtPurge.push(loadDecoder(compiled(false)) === failed);
    purge();
  });

  const failed = loadDecoder(compiled(true));
  await expect(failed).rejects.toThrow("no wasm");
  expect(heldAtPurge).toEqual([true]);

  // Released after the purge: the next open builds a module, keeps it, and reads with it.
  const decode = await loadDecoder(compiled(false));
  const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
  expect(await decode(blank)).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  purgeSpy.mockRestore();
  fetchSpy.mockRestore();
});
