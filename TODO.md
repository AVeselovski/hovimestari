# Open items

Things we found but did not do. Both of us write here, Artur and the agents. Nothing lives only in chat.

Each item says what it is, why it is open, and who decides. Delete an item when it lands. This file is a list of what is open, not a record of what was done.

## Needs a decision from Artur

- **Confirm the overview and the requirements.** `docs/overview.md` and `docs/requirements.md` are drafts written from the pivot conversation. Both are marked as drafts at the top. They become the foundation when Artur has read them, corrected them and removed the draft notes. Nothing should be built on a requirement he has not seen. Who decides: Artur.
- **Is there a shared household in the first version?** The drafts make every account personal. The earlier app served two people sharing one fridge. A shared space would let two people share recipes and the grocery list while keeping targets and days personal, at the cost of membership and invitation machinery like finanssi's vaults. Who decides: Artur.
- **Does an entry need a planned and eaten state?** The drafts say no: an entry on a future date is a plan, one on a past date is a log, and a meal that did not happen is removed. A state per entry would keep the log honest without deleting, at the cost of one more tap per meal. Who decides: Artur.
- **May a connected assistant change targets?** The drafts keep targets out of an assistant's reach (FR-AI-09), along with deleting recipes, saved meals and foods. Artur's own training assistant might reasonably adjust targets as a cut progresses. The app would still be giving no advice, since the assistant is the user's own. Who decides: Artur.
- **How does the grocery list handle someone who eats but does not log?** The drafts buy for the planned servings and let the user change that number per recipe on the list (FR-GROC-02). A household size setting is the alternative. Who decides: Artur.
- **Is UI copy English?** The drafts say yes, as in finanssi (NFR-COPY-01). The earlier app was Finnish throughout. Food names follow a per-user language setting either way. Who decides: Artur.
- **Does the visual identity carry over?** `CLAUDE.md` tells agents to keep the earlier paper, ink and oxblood look and its three typefaces as a working direction, and to design a dark theme. The name Hovimestari is kept too. Who decides: Artur.
- **Recipes before barcode scanning, or the other way round?** `docs/design/pivot-plan.md` builds recipes at step 5 and scanning at step 6. They can swap. Who decides: Artur.
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
