/** @jest-environment node */
import { readFileSync } from "node:fs";
import type { ZXingModuleOverrides } from "zxing-wasm/reader";
import { prepareZXingModule as prepareWriter, writeBarcode } from "zxing-wasm/writer";
import { loadDecoder } from "../decoder";

// A failed load tried again, with the real library. The library keeps the
// module it built for a set of overrides, a failed one too, and hands it
// back to the next call with equal overrides. The scanner passes the same
// overrides on every open, so without a purge a decoder that failed once
// would fail on every open after it. In its own file, because the library's
// module is shared by everything in one test file.

const bytes = (specifier: string): Buffer => readFileSync(require.resolve(specifier));

it("builds the module afresh on the next open after a failed load, with the same overrides", async () => {
  const wasm = bytes("zxing-wasm/reader/zxing_reader.wasm");
  let attempts = 0;
  const overrides: ZXingModuleOverrides = {
    // Emscripten's own hook for compiling the wasm: the first attempt fails, as a dropped download does.
    instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
      attempts += 1;
      if (attempts === 1) throw new Error("no wasm");
      const source: BufferSource = new Uint8Array(wasm);
      void WebAssembly.instantiate(source, imports).then(({ instance }) => done(instance));
      return {};
    },
  } as ZXingModuleOverrides;

  await expect(loadDecoder(overrides)).rejects.toThrow("no wasm");
  const decode = await loadDecoder(overrides);
  expect(attempts).toBe(2);

  // The module built on the retry reads a real code.
  await prepareWriter({
    overrides: { wasmBinary: bytes("zxing-wasm/writer/zxing_writer.wasm") },
    fireImmediately: true,
  });
  const { symbol, error } = await writeBarcode("6408430000258", { format: "EAN13" as never });
  if (error) throw new Error(error);
  const scale = 3;
  const margin = 40;
  const width = symbol.width * scale + margin * 2;
  const height = symbol.height * scale + margin * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < symbol.height * scale; y += 1) {
    for (let x = 0; x < symbol.width * scale; x += 1) {
      const at = ((y + margin) * width + x + margin) * 4;
      data[at] =
        data[at + 1] =
        data[at + 2] =
          symbol.data[Math.floor(y / scale) * symbol.width + Math.floor(x / scale)];
    }
  }
  expect(await decode({ data, width, height })).toEqual({ text: "6408430000258", format: undefined });
});
