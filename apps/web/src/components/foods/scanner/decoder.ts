import type { BarcodeFormat } from "@hovimestari/types";
import type { ReaderOptions, ZXingModuleOverrides } from "zxing-wasm/reader";

// ---------------------------------------------------------------------------
// decoder: the scanner's barcode decoder, ZXing-C++ built to WebAssembly by
// `zxing-wasm`. The only file that imports the library, so a decoder swap
// changes this file alone.
//
// - Loaded when the scanner opens, never before: `loadDecoder` imports the
//   reader and compiles its wasm at once (`fireImmediately`), in parallel
//   with the camera start. A failed load is forgotten, by this file and by
//   the library, so the next open tries again.
// - The wasm comes from this app, never from the library's default CDN. The
//   bundler emits `zxing_reader.wasm` under `/_next/static/media/` and
//   rewrites the URL below to it. `locateFile` hands the module that URL
//   before the first read, because without it the library fetches the file
//   from jsDelivr, which would tell a third party who opened the scanner and
//   break the scanner offline. The service worker caches `/_next/static/`
//   first, so a second open needs no download.
// - It reads the retail formats only, EAN-13, EAN-8, UPC-A and UPC-E, one
//   symbol per frame, trying harder. An EAN add-on (the 2 or 5 digits beside
//   a magazine's or a book's code) is ignored, so the text is the product's
//   own code. The decoder checks each code's check digit.
// - `formatOf` maps the decoder's format names to the ones the lookup takes.
//   Only an 8-digit code needs one, and the lookup ignores it on a longer
//   code. ZXing reports a UPC-A as an EAN-13 with a leading 0 and a UPC-E
//   expanded to 13 digits, so in practice only an EAN-8 reaches the server
//   as 8 digits.
//
// No frame leaves the device: a frame is decoded here, and what the scanner
// sends on is the text.
// ---------------------------------------------------------------------------

/** The decoder's names for the formats the scanner reads. */
export const RETAIL_FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE"] as const;

const READER_OPTIONS: ReaderOptions = {
  formats: [...RETAIL_FORMATS],
  tryHarder: true,
  maxNumberOfSymbols: 1,
  eanAddOnSymbol: "Ignore",
};

/** One frame's pixels: an `ImageData`, or the same shape where there is none, as in Node. */
export type Frame = Pick<ImageData, "data" | "width" | "height">;

/** What a frame held: the code as the decoder read it, and the format the lookup takes, if it takes one. */
export interface Decoded {
  text: string;
  format: BarcodeFormat | undefined;
}

/** Decodes one frame. Null when it holds no code the scanner reads. */
export type Decode = (frame: Frame) => Promise<Decoded | null>;

/** The lookup's name for a decoder format, for the formats that settle how an 8-digit code reads. */
export function formatOf(decoderFormat: string): BarcodeFormat | undefined {
  if (decoderFormat === "EAN8") return "ean_8";
  if (decoderFormat === "UPCE") return "upc_e";
  return undefined;
}

/** The URL this app serves the reader's wasm at, as the bundler rewrites it. */
export function appWasmUrl(): string {
  return new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url).href;
}

/** Module overrides that load the wasm from `wasmUrl` and from nowhere else. */
export function selfHosted(wasmUrl: string): ZXingModuleOverrides {
  return {
    locateFile: (path: string, prefix: string): string => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  };
}

let loading: Promise<Decode> | null = null;

/**
 * The decoder, loaded once. `overrides` defaults to this app's own wasm. A
 * Node test passes the wasm's bytes as `wasmBinary` instead.
 */
export function loadDecoder(overrides?: ZXingModuleOverrides): Promise<Decode> {
  loading ??= (async (): Promise<Decode> => {
    const zxing = await import("zxing-wasm/reader");
    try {
      await zxing.prepareZXingModule({ overrides: overrides ?? selfHosted(appWasmUrl()), fireImmediately: true });
    } catch (error) {
      // The library keeps a failed module by the overrides it was given, and hands it back to the
      // next call with equal ones. Purged here, with no await before `loading` is released below,
      // so the purge can only ever remove this failed module: a load that starts after the release
      // builds its own, and keeps it, with this app's overrides and never the library's CDN default.
      zxing.purgeZXingModule();
      throw error;
    }
    return async (frame) => {
      // An object of ImageData's shape is what the library reads, in a browser and in Node alike.
      const [result] = await zxing.readBarcodes(frame as ImageData, READER_OPTIONS);
      return result ? { text: result.text, format: formatOf(result.format) } : null;
    };
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
