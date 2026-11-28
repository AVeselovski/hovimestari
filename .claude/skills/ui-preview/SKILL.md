---
name: ui-preview
description: Write the part of the report to the owner that says what changed on screen and what to open and try in the app, and choose a few screenshots to attach to it as an aid. Use when reporting a merged change that touches anything user-visible, after ui-validator. Screenshots never gate a merge.
---

# UI preview: what changed on screen, and what to try

## Why this exists

A UI change merges when its checks pass: CI is green, the `@claude` review is answered, and
`validator`, `ui-validator` and `reviewer` have passed. The owner judges the change by using the
app, live, and sends feedback. That feedback starts a new branch.

He reads the last message of a stretch of work. So the message that reports a merged UI
change tells him what changed on screen and what to open and try. A few screenshots may go with
it, as an aid to finding the change. They are never a gate.

## When

On every change that touches anything user-visible, in the message that reports it merged or
ready. Run after the `ui-validator` step, whose screenshots you reuse. Every user-visible change
passes through `ui-validator`, so there is no branch without them. If a screenshot you need is
missing, capture it yourself in a real browser. Seed realistic data, never lorem-ipsum
placeholders.

## Steps

1. **Write what changed on screen.** Name each changed surface in the words the owner sees in
   the app: the tab, the sheet, the button. Say what is new or different there, in plain words.
2. **Write what to open and try.** Give the path through the app to each change and the thing
   to do there, for example "Open the Day tab, tap Log food, scan a barcode the app does not
   know." Name the states worth trying: an empty day, a refusal, the dark theme, the narrowest
   phone.
3. **Capture or collect screenshots.** Screenshots live in `screenshots` at the repo root,
   which is gitignored. Use descriptive kebab-case names (`settings-notifications-320-full.png`).
   Cover each changed surface at the widths that matter, and the important states and themes.
4. **Choose a few.** Attach only the few that help the owner find the change, not every
   validation artifact. Prefer one full-page shot for context plus a close-up of what changed.
5. **Attach them to the report** with the chat's file-sending tool (in Claude Code,
   `SendUserFile` with `display: "render"`), in one batch with that message. Give each one a
   line saying what it shows (for example "Notification toggles at 320px, dark theme.").
6. **Never commit screenshots.** `screenshots` stays gitignored. Do not move captures into the
   repo or the docs.

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

- The report follows the "Reporting to Artur" section of `CLAUDE.md`. It stands alone, and a
  screenshot that matters is attached to it again, never pointed at in an earlier message.
- Feedback the owner sends after using the app starts a new branch from `origin/master`.
