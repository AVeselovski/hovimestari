import { appWasmUrl, loadDecoder } from "../decoder";

// How the decoder loads, with the library's module stood in for: what
// `prepareZXingModule` is handed before the first read, and that a failed
// load is purged and tried again on the next open. decoder.test.ts decodes
// real images with the real library, and decoderRetry.test.ts retries a
// failed load with it.

jest.mock("zxing-wasm/reader", () => ({
  prepareZXingModule: jest.fn(),
  purgeZXingModule: jest.fn(),
  readBarcodes: jest.fn(),
}));

const CDN = "https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.7/dist/reader/";

beforeEach(() => {
  jest.resetModules();
});

/** A fresh copy of decoder.ts, so each test starts with no load held. */
async function freshLoad(): Promise<typeof loadDecoder> {
  return (await import("../decoder")).loadDecoder;
}

describe("loading the decoder", () => {
  it("prepares the module at once, with the app's own wasm, before any read", async () => {
    const zxing = await import("zxing-wasm/reader");
    jest.mocked(zxing.prepareZXingModule).mockResolvedValue({} as never);
    await (
      await freshLoad()
    )();
    expect(zxing.prepareZXingModule).toHaveBeenCalledTimes(1);
    expect(zxing.readBarcodes).not.toHaveBeenCalled();
    const [options] = jest.mocked(zxing.prepareZXingModule).mock.calls[0];
    expect(options?.fireImmediately).toBe(true);
    const located = options?.overrides?.locateFile?.("zxing_reader.wasm", CDN);
    expect(located).toBe(appWasmUrl());
    expect(located).not.toContain("jsdelivr");
    expect(located).toMatch(/zxing_reader\.wasm$/);
  });

  it("loads once for every open, and tries again after a failed load", async () => {
    const zxing = await import("zxing-wasm/reader");
    const prepare = jest.mocked(zxing.prepareZXingModule);
    prepare.mockRejectedValueOnce(new Error("no wasm")).mockResolvedValue({} as never);
    const load = await freshLoad();
    await expect(load()).rejects.toThrow("no wasm");
    expect(zxing.purgeZXingModule).toHaveBeenCalledTimes(1);
    await load();
    await load();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(zxing.purgeZXingModule).toHaveBeenCalledTimes(1);
  });
});
