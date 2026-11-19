/** @jest-environment node */
import { barcodeOf } from "@/lib/barcode";
import { readFileSync } from "node:fs";
import { prepareZXingModule as prepareWriter, writeBarcode } from "zxing-wasm/writer";
import { loadDecoder, selfHosted, type Decode, type Frame } from "../decoder";

// The decoder on real barcodes: each image is drawn at test time by the
// library's own writer, scaled up and set in a white frame as a camera would
// see it, and decoded by the reader the scanner runs. Nothing about the
// decoder is mocked. In Node, Emscripten would fetch the wasm by URL, so both
// modules get their wasm's bytes as `wasmBinary`.

/** The bytes of a wasm file, found through the package's own export of it, as the bundler finds it. */
const wasm = (specifier: string): ArrayBuffer => {
  const bytes = readFileSync(require.resolve(specifier));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

let decode: Decode;

beforeAll(async () => {
  await prepareWriter({
    overrides: { wasmBinary: wasm("zxing-wasm/writer/zxing_writer.wasm") },
    fireImmediately: true,
  });
  decode = await loadDecoder({ wasmBinary: wasm("zxing-wasm/reader/zxing_reader.wasm") });
});

/** `text` as a barcode of `format`, each module `scale` pixels wide, in a white frame `margin` pixels deep. */
async function frameOf(text: string, format: string, scale = 3, margin = 40): Promise<Frame> {
  const written = await writeBarcode(text, { format: format as never });
  if (written.error) throw new Error(written.error);
  const { symbol } = written;
  const width = symbol.width * scale + margin * 2;
  const height = symbol.height * scale + margin * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < symbol.height * scale; y += 1) {
    for (let x = 0; x < symbol.width * scale; x += 1) {
      const value = symbol.data[Math.floor(y / scale) * symbol.width + Math.floor(x / scale)];
      const at = ((y + margin) * width + x + margin) * 4;
      data[at] = data[at + 1] = data[at + 2] = value;
    }
  }
  return { data, width, height };
}

describe("the decoder", () => {
  it.each([
    ["EAN-13", "EAN13", "6408430000258", "6408430000258", undefined],
    ["EAN-8", "EAN8", "96385074", "96385074", "ean_8"],
    // ZXing reports a UPC-A as the EAN-13 it is, with a leading 0.
    ["UPC-A", "UPCA", "036000291452", "0036000291452", undefined],
    // And a UPC-E expanded to 13 digits, still marked as a UPC-E.
    ["UPC-E", "UPCE", "01234565", "0012345000065", "upc_e"],
  ])("reads a generated %s and maps its format to the lookup's", async (_name, format, written, text, lookupFormat) => {
    const result = await decode(await frameOf(written, format));
    expect(result).toEqual({ text, format: lookupFormat });
    // Every code it reads is one the search field takes as typed.
    expect(barcodeOf(result!.text)).toBe(text);
  });

  it.each([
    ["two", "9771234567003 12", "9771234567003"],
    ["five", "9780201379624 51200", "9780201379624"],
  ])("reads the product's own code from an EAN-13 with a %s digit add-on", async (_digits, written, text) => {
    expect(await decode(await frameOf(written, "EAN13"))).toEqual({ text, format: undefined });
  });

  it("reads nothing from a frame with no barcode", async () => {
    const blank = { data: new Uint8ClampedArray(320 * 240 * 4).fill(255), width: 320, height: 240 };
    expect(await decode(blank)).toBeNull();
  });

  it("reads no code it was not asked for, such as a QR code", async () => {
    expect(await decode(await frameOf("6408430000258", "QRCode", 6))).toBeNull();
  });
});

describe("where the wasm comes from", () => {
  const CDN = "https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.7/dist/reader/";

  it("hands the module the app's own URL for the wasm, whatever prefix the library would use", () => {
    const { locateFile } = selfHosted("/_next/static/media/zxing_reader.0123abcd.wasm");
    expect(locateFile?.("zxing_reader.wasm", CDN)).toBe("/_next/static/media/zxing_reader.0123abcd.wasm");
  });

  it("leaves any other file where the library looks for it", () => {
    const { locateFile } = selfHosted("/_next/static/media/zxing_reader.0123abcd.wasm");
    expect(locateFile?.("zxing_reader.data", "/static/")).toBe("/static/zxing_reader.data");
  });
});
