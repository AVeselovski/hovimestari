---
name: Barcode after a miss (2026-11-26)
description: Why a barcode after a missed scan rides on an own food copy, not a per-person tie table; carried-barcode lifetime; Artur's ranking of the three cases
type: project
---

Artur ranked (2026-11-26): 1) his own food tied to the barcode, 2) copy a Fineli food into his own, adjust to the label, tie the barcode, Fineli unchanged, 3) tie a barcode to a shared food as it is ("as an option why not"). Design `docs/design/barcode-after-miss.md` recommends building 1 and 2 only: a copy saved unchanged gives case 3's outcome with no table. Case 3 is in TODO.md as his decision.

- The barcode travels in `useFoodFinder` state (`carried`), set only by Search by name with exactly what Add it from the label would keep. Ends on log/add (`reset`), another barcode in the field, a save that uses it, Forget, sheet close. A new food fills it in; an edit only offers it by a button, so an unrelated fix never attaches it.
- Copy to my foods covers every shared food (one `CopyToOwnButton`, label varies by carried). Portions ride in the create body (`OwnFoodBodySchema.portions`, create only), Fineli units copied as English catalog labels, because a unit-coded owned portion breaks `food_portions_fineli_unowned` and has no edit path.

**Why:** the owner prefers the own-food case; a second mechanism (tie table) would duplicate own-food edit/delete/tool/visibility rules plus a retired-food rule.

**How to apply:** if Artur asks for the direct tie anyway, it is a new table `user_barcodes` read after own foods in `lookupBarcode`; the design's section g sizes it. Requirement wordings for FR-FOOD-04 and FR-SCAN-05 were pending with him at design time.
