# Colours and type

The design tokens: every colour, typeface, width and radius the app paints with. Components use only these, through the utility classes Tailwind generates from them, and never a raw value. This page says what each token is for. The values live in `apps/web/src/app/globals.css`.

## In detail

### The identity

A Nordic kitchen counter. By day, warm paper with dark forest-green ink and one oxblood accent. By night, forest green with paper-coloured ink and the oxblood lifted so it holds against the dark. There are no gradients, no glass and no decorative shadows. A panel stands off the page by its surface colour and a hairline rule.

### Colour tokens

| Token                    | Light     | Dark      | For                                                                                      |
| ------------------------ | --------- | --------- | ---------------------------------------------------------------------------------------- |
| `--color-bg`             | `#f6efe1` | `#121a15` | The page background                                                                      |
| `--color-surface`        | `#efe6d2` | `#1a251e` | Panels, the tab bar, the side rail                                                       |
| `--color-surface-raised` | `#fbf6ec` | `#223027` | Fields, segmented controls, a secondary button                                           |
| `--color-ink`            | `#1d2e22` | `#ece4d2` | Text and icons                                                                           |
| `--color-ink-muted`      | `#6b604b` | `#a39880` | Secondary text: section labels, hints, the tabs that are not current                     |
| `--color-rule`           | `#d8c9aa` | `#34402f` | Panel borders and the dashed header rule, as decoration                                  |
| `--color-field-rule`     | `#8a7a5c` | `#727d6a` | A field's border, which must be found without its fill                                   |
| `--color-accent`         | `#a13838` | `#d56f6a` | The primary action, the current tab, the chosen option, error lines, destructive actions |
| `--color-on-accent`      | `#fbf6ec` | `#121a15` | Text on an accent fill                                                                   |
| `--color-focus`          | `#1d2e22` | `#ece4d2` | The keyboard focus ring                                                                  |

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

They colour marks such as bars, dots and gauge fills. The figures themselves stay in ink. No screen uses them yet. Their values may be tuned when the first figures are drawn, but each keeps its hue.

### Contrast

Text meets 4.5 to 1 against the surface it sits on, and a mark meets 3 to 1. Measured in the browser:

- Muted text: 5.4 to 1 on the page and 5.0 to 1 on a panel in light, 6.2 to 1 and 5.6 to 1 in dark.
- The accent as text on the tab bar: 5.4 to 1 in light and 4.8 to 1 in dark.
- Text on an accent fill: 6.2 to 1 in light and 5.3 to 1 in dark.
- A field's border: 3.7 to 1 on the page and 3.4 to 1 on a panel in light, 4.1 to 1 and 3.7 to 1 in dark. A control's edge needs 3 to 1. A panel's border is decoration and needs none.

`src/app/__tests__/themeColors.test.ts` reads the tokens from `globals.css` and fails when a field border, accent text or muted text drops under its line.

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

- Widths: `--container-page` (40rem) and `--container-page-narrow` (36rem) for the tabs' content from `md`, `--container-auth` (26rem) for the guest pages' column, `--spacing-rail` (14rem) for the side rail.
- Radii: `--radius-control` for fields and buttons, `--radius-card` for panels, `--radius-pill`.
- Safe areas: `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`, the device's insets.
- Class recipes in `apps/web/src/components/ui/styles.ts` compose the tokens into buttons, fields, notices, panels and the focus ring, so a view never repeats a raw value.

### Adding a token

When a surface needs a colour, size or space the tokens lack, add a token with a light and a dark value, measure its contrast in both themes, and add its row here.

## Features on this page

- [Appearance](../features/appearance.md): the light and dark themes these tokens paint.
