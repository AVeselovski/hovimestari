---
name: Scan misses design (2026-11-26)
description: Owner decisions on barcode misses: Lidl RCN-8 looked up and kept shared, wrong_digits as a lookup answer, Search by name and Scan again in the block
type: project
---

On 2026-11-26 Artur decided (via the orchestrator) to look up Lidl's 8-digit codes starting 2 and to add **Search by name** and **Scan again** at a miss. Design: `docs/design/scan-misses.md`.

- Only `0000002` leaves `isInStore`. `0000000` stays the shop's own because that 14-digit form is shared by RCN-8 prefix 0 and UPC Prefix 000000; the rule reads only the 14-digit form, by design, so a padded code reads the same.
- Kept Lidl products stay shared: OFF has one record per code whoever asks, so per-person keeping only adds calls and a table. The per-person correction is an own food under the code (own foods win), reached by Copy to your foods, which the ingredient picker lacked.
- A wrong check digit is a lookup _answer_ (`wrong_digits`), not a 400, because the lookup's first step must still find an own food saved under any digits. The own-food schema refuses such a barcode.
- Still undecided by Artur: letting a Fineli food picked after a miss remember the barcode (changes FR-SCAN-02/05 wording).

**Why:** the investigation (`scan-misses-investigation.md`, on the hovi-web branch) found 4 of 5 Lidl codes held by OFF with all figures, and Artur's stated order is scan, Fineli by name, own food.

**How to apply:** later barcode work starts from these rules; do not reintroduce per-person product rows or a phone-side pre-check of the lookup without new evidence.
