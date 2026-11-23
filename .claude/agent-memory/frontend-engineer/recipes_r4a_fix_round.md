---
name: Recipes R4a fix round (the as made sheet)
description: What the R4a fix batch (2026-11-23) decided or cost a round trip: replays compared with the server, a host sheet that goes stale under a stacked one, a list hook that empties while it reads, mutation runs that lock the tree, the 68 px row slot, the shared row in the entry sheet, cards in sheets
type: project
---

- **A replay is compared with what the server holds, never with the first body sent.** After two presses with no answer the app cannot know which landed. `sameBatch` in `cookDraft.ts` does it. A resend test needs a changed body and also a body with something taken away (a row removed): only that one kills "ignores the entries".
- **After a lost answer lands, the days are read again and a ticked serving is no longer plain.** A list that filters on "plain" then drops it and the same press sends less. `useOtherServings` keeps entries of the sheet's own batch id. The first version of the same-batch test went red on exactly this.
- **A sheet stacked on another leaves the one under it stale.** The entry sheet shows the entry as it was at open, so after "logged as first sent" Cancel must close both (`onLogged(() => {})`), or the person lands on a planned entry with Log as made that is really a batch's eaten serving.
- **A hook that answers `[]` while it reads drops the selection made in its list.** Answer `{ entries, settled }`, keep the last settled list in state, and hold the submit while unsettled and something is ticked.
- **A read-before-open hook asks its host again at answer time** (`mayOpen`) and takes a ticket per press. The entry sheet: open, not dirty, not saving, not removing. The log sheet: still on that recipe's view. The recipe page: no other sheet open or being read for.
- **A mutation script that edits files in place locks the tree for its whole run** (about 35 s a mutation here). Do docs meanwhile, never source, and never start a build until it ends.
- **Decided by the orchestrator: every row of the as made sheet ends in a 68 px slot** (`rowTrailSlot`) for the chevron or Put back, so a long Fineli name wraps the same in both states. Test rows with long names: "Oliiviöljy" hid it.
- **Decided: the entry sheet's Open recipe and Log as made share one 44 px row, with one kept line under it** for "Save or cancel first.", which dims both. 634 of 634 px at 390 by 844. The batch line stands in Log as made's place and takes two lines at 390, three at 320.
- **Decided: Leave out is ink (`btnText`), Remove ingredient stays accent.** `words.takeOut` and `takeOutLabel` carry both the label and the tone.
- **Decided: a card in a sheet takes the surface its sheet is not on** (`cardInSheetClass`, `--sheet-card` set by the popup), so it is filled stacked or not. The editor's figures card changed with it.
- **Any row of new servings can be removed, and a ticked planned serving alone can be a batch.** `firstStands` keeps a later row from jumping over Add servings when the first goes.
- **The tab bar never covers the page**: `<main>` scrolls above it. "Half under the tab bar" in a report is a fold cut, measured 10 px on the recipe page at 390 by 844.
- **A seed's JWT lasts 15 minutes.** A sweep script that calls the API at its end must log in again (`common.mjs` does, `walk.mjs` did not).

**Why:** each was a defect the checks found in R4a, a design call the orchestrator settled, or a run lost in the fix round.
**How to apply:** before R4b (editing a batch), and before any sheet that lists server data to tick or resends by id.
