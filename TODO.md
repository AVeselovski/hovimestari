# Open items

Things we found but did not do. Both of us write here, Artur and the agents. Nothing lives only in chat.

Each item says what it is, why it is open, and who decides. Delete an item when it lands. This file is a list of what is open, not a record of what was done.

## Needs a decision from Artur

- **Confirm the overview and the requirements.** `docs/overview.md` and `docs/requirements.md` are drafts written from the pivot conversation. Both are marked as drafts at the top. They become the foundation when Artur has read them, corrected them and removed the draft notes. Nothing should be built on a requirement he has not seen. Who decides: Artur.
- **May a connected assistant delete recipes, saved meals and foods?** The drafts keep deletion out of an assistant's reach (FR-AI-09), as finanssi does for transactions. The one thing a writing key can remove is an entry on a day. Artur allowed assistants to change targets, and this is the remaining limit on what a writing key can do. Who decides: Artur.
- **How does the grocery list handle someone who eats but does not log?** The drafts buy for the planned servings and let the user change that number per recipe on the list (FR-GROC-02). A household size setting is the alternative. Who decides: Artur.
- **Which model do the agents run on?** Every agent is set to `opus`, copied from finanssi's rule. Who decides: Artur.
- **Hosting accounts and a domain.** The plan is a new Fly.io app with Postgres and a new Vercel project, as in finanssi. Someone has to create them and choose a domain before the scaffold can deploy. Who decides: Artur.

## Ready to pick up

- **Verify the Fineli facts on the source.** The licence, the current release, the download location, the table layout, whether portion sizes are included and the energy unit all come from community repositories, because `fineli.fi` blocked automated reading during research. Needed before the food import is designed. No product decision. Who decides: whoever picks it up.
- **Read the Open Food Facts licence against the plan to keep scanned products.** ODbL may treat a catalogue that keeps looked-up products as a derived database. Needed before barcode scanning is designed. Who decides: whoever picks it up, with Artur if the answer changes what is stored.
- **Prototype barcode scanning in an installed PWA on an iPhone.** Safari has no built-in barcode detector, and camera access inside an installed web app has a history of platform bugs. A throwaway page tested on Artur's phone settles whether the camera flow is sound. Who decides: whoever picks it up.
- **Give future sessions the finanssi repository.** The scaffold lifts code from `AVeselovski/finanssiappisV2`. A cloud session can read it only when it is attached to the session. Who decides: Artur, when starting the scaffold session.

## Known gaps, deliberately unbuilt

- **The typecheck and lint steps in CI do no work yet.** The earlier app has no `typecheck` or `lint` script in any workspace, so `pnpm typecheck` and `pnpm lint` find nothing to run and pass. Type errors are still caught, because each workspace's build runs the TypeScript compiler. Both steps start working when the scaffold adds the scripts. Left as is because the earlier app is about to be removed. Who decides: nobody, it resolves with the scaffold.
- **`docs/app/colors.md` does not exist.** `CLAUDE.md` names it as the token reference. It is written with the first UI design, when the macro hues are chosen. Who decides: the architect of the first UI step.
- **The earlier app's seed recipes are not carried over.** They have no gram weights and no food links, so they cannot become recipes with computed figures without re-entering each one. An assistant with a writing key can re-create the ones worth keeping once recipes exist. Who decides: Artur.
