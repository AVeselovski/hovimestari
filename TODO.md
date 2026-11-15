# Open items

Things we found but did not do. Both of us write here, Artur and the agents. Nothing lives only in chat.

Each item says what it is, why it is open, and who decides. Delete an item when it lands. This file is a list of what is open, not a record of what was done.

## Needs a decision from Artur

Nothing open.

## Ready to pick up

- **Verify the Fineli facts on the source.** The licence, the current release, the download location, the table layout, whether portion sizes are included and the energy unit all come from community repositories, because `fineli.fi` blocked automated reading during research. Needed before the food import is designed. No product decision. Who decides: whoever picks it up.
- **Read the Open Food Facts licence against the plan to keep scanned products.** ODbL may treat a catalogue that keeps looked-up products as a derived database. Needed before barcode scanning is designed. Who decides: whoever picks it up, with Artur if the answer changes what is stored.
- **Prototype barcode scanning in an installed PWA on an iPhone.** Safari has no built-in barcode detector, and camera access inside an installed web app has a history of platform bugs. A throwaway page tested on Artur's phone settles whether the camera flow is sound. Who decides: whoever picks it up.
- **Give future sessions the finanssi repository.** The scaffold lifts code from `AVeselovski/finanssiappisV2`. A cloud session can read it only when it is attached to the session. Who decides: Artur, when starting the scaffold session.

## Known gaps, deliberately unbuilt

- **The app is not deployed, on purpose.** Development runs locally until the app is worth testing on a phone through a working day, which is about when days and quick logging work. The scaffold writes the Fly.io and Vercel runbooks in `docs/setup/` and Artur runs them then, as he did for finanssi. Until that day, checks that need a real phone need a tunnel to the local servers, because installing the app and using the camera both need HTTPS. Who decides: Artur, when he wants it on his phone.
- **The typecheck and lint steps in CI do no work yet.** The earlier app has no `typecheck` or `lint` script in any workspace, so `pnpm typecheck` and `pnpm lint` find nothing to run and pass. Type errors are still caught, because each workspace's build runs the TypeScript compiler. Both steps start working when the scaffold adds the scripts. The scaffold also drops `--if-present` from the root `typecheck`, `lint` and `test` scripts, so a workspace without one fails CI. Left as is because the earlier app is about to be removed. Who decides: nobody, it resolves with the scaffold.
- **`docs/app/colors.md` does not exist.** `CLAUDE.md` names it as the token reference. It is written with the first UI design, when the macro hues are chosen. Who decides: the architect of the first UI step.
- **The earlier app's seed recipes are not carried over.** They have no gram weights and no food links, so they cannot become recipes with computed figures without re-entering each one. An assistant with a writing key can re-create the ones worth keeping once recipes exist. Who decides: Artur.
