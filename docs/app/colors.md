# Colours and type

The design tokens: every colour, typeface, width and radius the app paints with. Components use only these, through the utility classes Tailwind generates from them, and never a raw value. This page says what each token is for. The values live in `apps/web/src/app/globals.css`.

## In detail

### The identity

A Nordic kitchen counter. By day, warm paper with dark forest-green ink and one oxblood accent. By night, forest green with paper-coloured ink and the oxblood lifted so it holds against the dark. There are no gradients, no glass and no decorative shadows. A panel stands off the page by its surface colour and a hairline rule.

### Colour tokens

| Token                    | Light      | Dark         | For                                                                                      |
| ------------------------ | ---------- | ------------ | ---------------------------------------------------------------------------------------- |
| `--color-bg`             | `#f6efe1`  | `#121a15`    | The page background                                                                      |
| `--color-surface`        | `#efe6d2`  | `#1a251e`    | Panels, the tab bar, the side rail                                                       |
| `--color-surface-raised` | `#fbf6ec`  | `#223027`    | Fields, segmented controls, a secondary button                                           |
| `--color-ink`            | `#1d2e22`  | `#ece4d2`    | Text and icons                                                                           |
| `--color-ink-muted`      | `#6b604b`  | `#a39880`    | Secondary text: section labels, hints, the tabs that are not current                     |
| `--color-rule`           | `#d8c9aa`  | `#34402f`    | Panel borders and the dashed header rule, as decoration                                  |
| `--color-field-rule`     | `#8a7a5c`  | `#727d6a`    | A field's border and a secondary button's, which must be found without their fill        |
| `--color-accent`         | `#a13838`  | `#de7b75`    | The primary action, the current tab, the chosen option, error lines, destructive actions |
| `--color-on-accent`      | `#fbf6ec`  | `#121a15`    | Text on an accent fill                                                                   |
| `--color-focus`          | `#1d2e22`  | `#ece4d2`    | The keyboard focus ring                                                                  |
| `--color-scrim`          | ink at 45% | black at 60% | The dim behind an open sheet or dialog, the only shading in the app                      |

The utilities are named after the token: `bg-surface`, `text-ink-muted`, `border-rule`, `bg-accent`, `text-on-accent`, `outline-focus`.

### What the accent means

The accent is the one chromatic colour. It marks what to press next, what is chosen and what went wrong. Error lines and destructive buttons share it, because a second red would read as the same colour. The focus ring is ink, never the accent, so focus never looks like a choice.

### The macro hues

Four hues are reserved for the four figures a day is measured in. Nothing else may use them: no decorative surface, no state, no selection.

| Token             | Light     | Dark      | For                         |
| ----------------- | --------- | --------- | --------------------------- |
| `--color-energy`  | `#a86a12` | `#e0a64a` | Energy marks, amber         |
| `--color-protein` | `#2f6690` | `#7fb0d8` | Protein marks, fjord blue   |
| `--color-carbs`   | `#7a4f86` | `#b893c4` | Carbohydrate marks, heather |
| `--color-fat`     | `#2f7a72` | `#6fbfb3` | Fat marks, teal             |

They colour marks such as dots and gauge fills. The figures themselves stay in ink. Two components draw them: `MacroDot`, the 10 pixel dot beside a figure in the log sheet's figures, the Day tab's entries and its carbohydrates and fat, and `Gauge`, the Day tab's gauge. `apps/web/src/components/figures/__tests__/macroHues.test.ts` fails when any source file other than `MacroDot.tsx` and `Gauge.tsx` uses one as a colour class, when a colour class is built from a template string, and when `globals.css` names one outside its own declaration. Their values may be tuned as more figures are drawn, but each keeps its hue.

### The gauge

The Day tab's gauge for calories and protein ([the gauge](day.md#the-gauge)). Its track and band are neutral, and only its fills carry a hue.

| Token                  | Light     | Dark      | For                                                                 |
| ---------------------- | --------- | --------- | ------------------------------------------------------------------- |
| `--color-gauge-track`  | `#efe6d2` | `#1a251e` | The track, the panel colour                                         |
| `--color-gauge-range`  | `#bfb59d` | `#41463a` | The target band, from the muted ink, never the green ink            |
| `--color-energy-plan`  | `#e6d3b4` | `#504425` | The planned part of the calories gauge, inside a border of `energy` |
| `--color-protein-plan` | `#bac6c9` | `#334750` | The planned part of the protein gauge, inside a border of `protein` |

What the gauge may colour: the eaten fill in the macro's hue, the planned part's tint and its border in the macro's hue, and the end-cap past the end of the track in the style of the reading that passes. What it may not: the track, the band, the two ticks, the legend and every figure and line of text. Nothing in it changes colour past a bound, and it never uses the accent. The ticks are ink with a 1 pixel edge of the page colour on each side, so a tick reads against the fills and the band alike. An eaten end-cap meets an eaten fill of its own hue, so it carries the same 1 pixel edge of the page colour on its inner side.

### Contrast

Text meets 4.5 to 1 against the surface it sits on, and a mark or a control's edge meets 3 to 1. The ratios, from the token values:

- Muted text: 5.4 to 1 on the page and 5.0 to 1 on a panel in light, 6.2 to 1 and 5.6 to 1 in dark.
- The accent as text on the page: 5.8 to 1 in light and 6.1 to 1 in dark. On the tab bar and a panel: 5.4 to 1 in both.
- The accent as text on a raised surface, as on an outlined destructive button: 6.2 to 1 in light and 4.7 to 1 in dark.
- Text on an accent fill: 6.2 to 1 in light and 6.1 to 1 in dark.
- The macro hues as marks: in light from 3.6 to 1 (energy on a panel) up to 5.9 to 1, in dark from 5.3 to 1 (carbohydrates on a raised surface) up to 8.3 to 1, against the page, a panel and a raised surface.
- A field's border, a secondary button's and a segmented control's tray: 3.7 to 1 on the page and 3.4 to 1 on a panel in light, 4.1 to 1 and 3.7 to 1 in dark. A control's edge needs 3 to 1. A panel's border is decoration and needs none.
- The gauge's band against its track: 1.6 to 1 in both themes, enough to find the range on a decoration. The planned part's border, the full hue, against the track: 3.6 to 1 (calories) and 4.9 to 1 (protein) in light, 7.3 to 1 and 6.9 to 1 in dark. A tick against every surface it crosses reaches 3 to 1 through its ink or its page-coloured edge, whichever stands out: at least 3.2 to 1 in light and 7.6 to 1 in dark.
- The toast: the page colour on ink, 12.5 to 1 in light and 14.0 to 1 in dark.
- A text button's underline, the mark that makes the words a button: `--color-field-rule` for an ordinary one, and the accent at 70 % for one that leads to something destructive. The accent's underline reaches 3.3 to 1 on the page and 3.2 to 1 on a panel in light, 3.6 to 1 and 3.3 to 1 in dark. On a raised surface, the field rule reaches 3.9 to 1 in light and 3.2 to 1 in dark, and the accent's underline 3.4 to 1 and 3.1 to 1. Under the pointer or a press, either fills in, to ink or the full accent.

`src/app/__tests__/themeColors.test.ts` reads the tokens from `globals.css` and fails when a field border, a text button's underline, accent text, text on an accent fill or muted text drops under its line, when a macro hue drops under 3 to 1 on any surface, when the gauge's band drops under 1.5 to 1 against its track, when a planned part's border drops under 3 to 1 against the track, and when a tick falls under 3 to 1 on a fill, a tint or the band.

### Motion

A sheet slides up on the curve `--ease-sheet` (`cubic-bezier(0.32, 0.72, 0, 1)`), fast out and long to settle, the curve iOS sheets move on. It takes `--duration-sheet` (450ms) to arrive and to spring back from a drag let go too early, and `--duration-sheet-exit` (400ms) to leave, shortened by a fast swipe. From `md` the dialog fades and scales in `--duration-dialog` (200ms). With reduced motion every one of these is a fade of `--duration-fade` (150ms), and a drag still follows the finger. The rules are the utilities `sheet-popup-motion` and `sheet-backdrop-motion` in `globals.css`.

A toast rises a little and fades in over `--duration-dialog`, and fades out where it is (`toast-motion`). A gauge's fills ease to a new width over 240ms on `--ease-sheet` when the same day's figures change, and paint without motion on a new date and under reduced motion (`gauge-fill-motion`).

A sheet lifts from the page by its surface colour and a hairline `--color-rule` border, never by a shadow. A sheet stacked on another takes `--color-surface-raised`, so the two read apart. `--sheet-min-height` (14rem) is the shortest a sheet stands on a phone.

On a phone a sheet with another stacked on it shrinks to `--sheet-stack-scale` (0.94) about its top edge, and keeps `--sheet-stack-peek` (0.75rem) of itself in view above the one on top. The stacked sheet dims what is under it by `--sheet-stack-dim` (0.5) of the scrim, because the page is already dimmed once.

### Layers

One ladder, in `apps/web/src/components/ui/styles.ts`: the page at the default, a page header that stays in view while its page scrolls under it at 20 (`zPageHeader`, the Day tab's date bar and launcher), the header, tab bar and side rail at 30 (`zShell`), the toast at 40 (`zToast`), and a sheet with its scrim at 50 (`zSheet`). The tab bar and the toast sit under every sheet. A new layer takes its class from the ladder, never a number of its own.

### Type

| Token            | Face            | For                                      |
| ---------------- | --------------- | ---------------------------------------- |
| `--font-display` | Fraunces        | The wordmark and page titles             |
| `--font-body`    | Instrument Sans | Everything else                          |
| `--font-mono`    | JetBrains Mono  | Figures and lists, from the first figure |

The page title is `text-title`, 1.75rem on a phone, and `text-title-lg`, 2.25rem from `md`. Section labels use the `section-label` utility: small caps, tracked 0.2em, in muted ink. Body text is 1rem. Every field's text is 16 pixels, so iOS never zooms on focus.

## How it works

### Where the tokens live

`globals.css` declares the tokens in Tailwind's `@theme` block with their light values and overrides the colours under `[data-theme="dark"]`, which the theme script sets on `<html>`. The block starts with `--color-*: initial`, which removes Tailwind's own palette, so a raw class such as `bg-red-500` generates nothing. The lint rule in `apps/web/eslint.config.js` refuses one anyway, along with raw black and white and shadcn's token names.

The fonts are the three variable `woff2` files in `apps/web/src/app/fonts/`, loaded by `next/font/local` in the root layout with `display: swap`.

### Other tokens

- Widths: `--container-page` (40rem) for every tab's content column from `md`, `--container-page-wide` (64rem) for the Day tab's two columns from `lg`, `--container-auth` (26rem) for the guest pages' column, `--spacing-rail` (14rem) for the side rail.
- Heights: `--spacing-tab-bar` (3.5rem), the phone's tab bar cell, which the toast's place above it reads too. `--spacing-toast-clearance` (7.25rem), the room a page keeps at its end for the tallest toast: three lines of text, the toast's padding and the gap it hangs above the tab bar by.
- The Day tab's header: `--day-header-top` (0.5rem on a phone, 2rem from `md`), the room above the date bar. `--day-header-gap` (1rem), between the date bar and the launcher. `--day-header-clear` (0.75rem), from the launcher to the header's bottom edge, its one-pixel line included. `--day-header-height`, the header's whole height. `--day-header-rest` (0.25rem), the room above the content at rest, which scrolls away under the header, so the content starts 1rem under the launcher. `--day-content-top`, the two together: where the content starts at rest, which `under-day-header` gives the content as its scroll margin and where the summary stays from `lg`.
- The toast: ink as its fill and the page colour as its text, the inverse of the page, so it reads apart from every surface under it.
- Radii: `--radius-control` for fields and buttons, `--radius-card` for panels, `--radius-pill`.
- Safe areas: `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`, the device's insets.
- Class recipes in `apps/web/src/components/ui/styles.ts` compose the tokens into buttons, fields, notices, panels and the focus ring, so a view never repeats a raw value.

### Adding a token

When a surface needs a colour, size or space the tokens lack, add a token with a light and a dark value, measure its contrast in both themes, and add its row here.

## Features on this page

- [Appearance](../features/appearance.md): the light and dark themes these tokens paint.
