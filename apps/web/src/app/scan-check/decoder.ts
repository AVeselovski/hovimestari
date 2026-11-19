// The decoder for the throwaway camera check page (branch spike/scan-check,
// which never merges). It follows the loading recipe in
// docs/design/barcode.md: imported only when the camera starts, and the wasm
// served from this app, never from the library's default CDN.
import type { ReadResult } from "zxing-wasm/reader";

export interface LoadedDecoder {
  read: (image: ImageData) => Promise<ReadResult[]>;
  /** Milliseconds from the start of loading to a compiled module. */
  ms: number;
  /** The URL the wasm was fetched from. */
  wasmUrl: string;
  version: string;
}

let loading: Promise<LoadedDecoder> | null = null;

export function loadDecoder(): Promise<LoadedDecoder> {
  loading ??= (async (): Promise<LoadedDecoder> => {
    const started = performance.now();
    // The bundler emits the wasm as a static asset and rewrites this URL to it.
    const wasmUrl = new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url).href;
    const zxing = await import("zxing-wasm/reader");
    await zxing.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string): string => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
      },
      fireImmediately: true,
    });
    return {
      read: (image) =>
        zxing.readBarcodes(image, {
          formats: ["EAN13", "EAN8", "UPCA", "UPCE"],
          tryHarder: true,
          maxNumberOfSymbols: 1,
        }),
      ms: Math.round(performance.now() - started),
      wasmUrl,
      version: zxing.ZXING_WASM_VERSION,
    };
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
