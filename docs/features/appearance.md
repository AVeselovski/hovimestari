# Appearance

The app comes in a light theme and a dark theme, and can follow the device's own setting. The choice is made in Settings and kept on the device it was made on, so a phone and a laptop can differ.

## In detail

### Choosing a theme

Settings has three choices under Appearance: **Light**, **Dark** and **Device**. Device is the starting choice. It follows the phone or computer, and changes with it, for example when the phone turns dark in the evening. Light and Dark stay as they are whatever the device does.

The choice applies at once and is kept on this device. Another device keeps its own. The first frame of every page is already in the chosen theme, so the app never flashes the wrong one while it loads.

### The browser around the app

On a phone the browser's own bar and the installed app's status bar take the page's background colour, so the app reads as one surface. With Device they follow the device's light or dark setting. With Light or Dark they take that theme's colour.

## How it works

### The stored choice

`ThemeContext` in `apps/web/src/contexts/ThemeContext.tsx` owns the choice: `light`, `dark` or `system`. It writes it to `localStorage` under `hovi-theme`, and sets two attributes on `<html>`: `data-theme` is what is painted, `light` or `dark`, and `data-theme-mode` is the stored choice. While the choice is `system`, it listens to `prefers-color-scheme` and repaints when the device changes.

Storage can refuse a write, for example in some private windows. The choice then lasts until the page closes. `useTheme()` outside the provider returns a safe default instead of throwing.

### The pre-paint script

`apps/web/src/lib/theme/noFlashScript.ts` holds a small script that the root layout puts first in `<head>`. It runs before anything paints: it reads `hovi-theme`, resolves `system` against the device, and sets both attributes. A value it does not know counts as `system`. When storage throws it paints light. The provider reads its first value from `data-theme-mode`, so the script and the provider always agree.

### The browser chrome colour

The root layout's `viewport` export renders one `theme-color` meta per colour scheme, the page background of each theme. `ThemeContext` rewrites both to the chosen theme's colour for Light or Dark, and puts each back for Device. The colours are `THEME_COLORS` in `noFlashScript.ts`.

### The tokens

Every colour the app paints is a token in `apps/web/src/app/globals.css`, with a light value and a dark one. [The colour reference](../app/colors.md) lists them.

Requirements: FR-SET-03, NFR-UX-04 (requirements 3.12 and 4)

## Where it appears

- [Settings](../app/settings.md): the Appearance section, where the theme is chosen.
- [The app shell](../app/shell.md): every page paints in the chosen theme from its first frame.
