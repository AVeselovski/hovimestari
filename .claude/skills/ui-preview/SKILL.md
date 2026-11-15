---
name: ui-preview
description: Send screenshots of UI changes to the owner in chat for human visual sign-off BEFORE the PR is merged. Applies when the project's preview deployments cannot be used for validation. Then use it on every branch that changes anything user-visible, after ui-validator, because pre-merge screenshots in chat are the only human visual gate.
---

# UI preview: pre-merge screenshots for human sign-off

## Why this exists

This gate applies when the project's preview deployments cannot be used for validation (for
example, they are not wired to a working backend or login). In that case, without this gate
the owner's first real look at a UI change is production, after merge. That turns small
visual misses into whole new PR rounds. The ui-validator already runs the app live and
captures screenshots. This skill closes the loop by putting a curated set of them in front
of the owner in chat before merge.

If your project does have usable preview deployments, a link to the preview can replace the
screenshots. Keep the gate itself: the owner sees the change before it merges.

## When

When preview deployments cannot be used for validation: every branch that changes anything
user-visible. Run after the `ui-validator` step, whose screenshots you reuse. Every user-visible
change passes through `ui-validator`, so there is no branch without them. If a screenshot you need
is missing, capture it yourself in a real browser. Seed realistic data, never lorem-ipsum placeholders.

## Steps

1. **Capture or collect.** Screenshots live in `screenshots` at the repo root, which
   is gitignored. Use descriptive kebab-case names (`settings-notifications-320-full.png`).
   Cover:
   - each changed surface, at the widths that matter (the narrowest supported mobile
     width for mobile-facing surfaces, desktop for desktop surfaces, both when a change
     spans them).
   - the important states and variants (empty state, error and edge copy variants, light
     and dark theme if the product has both).
   - when modifying existing UI, a before and after pair of the affected area if cheap to
     produce.
2. **Curate.** Send the 3 to 6 screenshots that show the user-visible change, not every
   validation artifact. Prefer one full-page shot for context plus close-ups of what
   changed.
3. **Send in chat** with the chat's file-sending tool (in Claude Code, `SendUserFile` with
   `display: "render"`), in one batch. Add a caption that says what to look at and
   explicitly invites the visual check before merge (for example "Notification toggles
   at 320px. Glance before merging.").
4. **Note it in the PR body** with a line like "Screenshots shared in chat for pre-merge
   visual review." Images cannot be uploaded to PR comments by the API (GitHub's
   attachment endpoint is browser-only, and a bot can only embed already-hosted URLs),
   so chat is the channel. The PR line exists so the record shows the gate happened.
5. **Never commit screenshots.** `screenshots` stays gitignored. Do not move
   captures into the repo or the docs.

## Keep every screenshot under 2000px on its long side

Once a conversation holds enough images, the API drops its per-image limit to 2000 pixels.
It then rejects every image in the request (new ones, small ones and the human's own
attachments alike) because one oversized image is somewhere in the history. It fails as a
bare "media removed" error with no hint at the real cause, and it cannot be undone within
that session.

The trap is the device pixel ratio. A screenshot taken at device scale multiplies the CSS
size by the ratio, so a 1440px-wide viewport on a 2x display lands at 2880px. Capture at
CSS scale (Playwright's `browser_take_screenshot` defaults to `scale: "css"`, which is what
you want). For an image you did not capture yourself, downscale it first, for example
`sips -Z 1800 <file>` on macOS or `magick <file> -resize 1800x1800\> <file>` elsewhere.

## Notes

- This is a presentation gate, not a replacement for ui-validator's functional gates
  (contrast, accessibility, layout). Send screenshots even when all gates pass. The owner
  is checking taste and intent, which no gate covers.
- If the owner requests changes based on the screenshots, treat it like a review round on
  the open PR. Fix on the same branch before merge, and send updated screenshots.
