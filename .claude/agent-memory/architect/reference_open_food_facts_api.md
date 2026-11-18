---
name: Open Food Facts API facts
description: Verified 2026-11-18 behaviour of the OFF v2 product read, limits, licence duty, per-100ml trap; and the scanner library sizes
type: reference
---

Verified live and from the docs on 2026-11-18 (barcode design, `docs/design/barcode.md`):

- `GET https://world.openfoodfacts.org/api/v2/product/{code}?fields=...` needs no auth. Found: 200 `status: 1`. Not found: **404** `status: 0`. Invalid code: 200 `status: 0`. A 12-digit UPC-A comes back as 13 digits with a leading 0, so match barcodes padded to 14.
- Limit is **15 product reads a minute per IP** (not the 100/min third-party pages claim). The server's IP is shared by every user.
- `nutrition_data_per` can be `"100ml"` and the `_100g` fields then hold per-100-ml values (Valio milk 6408430000258).
- Attribution: mention ODbL and Open Food Facts, link openfoodfacts.org or the product page. ODbL share-alike for kept rows was not legally settled; Artur deferred it until the app opens to others.
- UA should be `App/Version (contact)`; the brief forbids personal detail in code, so the contact is an env value the owner sets.
- `zxing-wasm` 3.1.7 reader wasm is 946,598 bytes (411 KB gzipped), MIT, exports `./reader/zxing_reader.wasm`, `prepareZXingModule`, `readBarcodes`, `ZXING_WASM_SHA256`. npm view and `npm pack` work in the agent container, while npmjs.com pages answer 403 to WebFetch.

**How to apply:** start from these facts and re-check the limit and the not-found status before relying on them in code.
