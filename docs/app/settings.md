# Settings

The fourth tab. It holds the choices a person makes rarely: how the app looks, and their account. Each part is a panel with a small-caps label.

## In detail

### Appearance

Three equal segments: **Light**, **Dark** and **Device**, each with its icon. The chosen one is filled with the accent colour. The change applies at once, and [the choice](../features/appearance.md#choosing-a-theme) belongs to this device.

### Account

"Signed in as" with the account's email in bold, then a **Sign out** button, which reads "Signing out…" while it works. A long email wraps before its "@" or a dot rather than mid-word. Signing out ends the session on this device and opens the plain sign-in page, so the next sign-in starts on the Day tab.

### On a phone

The panels fill the width. The theme segments and the sign-out button are full-width 44 to 48 pixel targets. On a phone narrower than 372 pixels, each segment's icon sits above its label, so all three fit.

## How it works

### Route and entry

`/settings`, in `apps/web/src/app/(app)/settings/`. The page composes `AppearanceSection` and `AccountSection` from its `_components/` folder.

### Layout

One column 36rem wide at most from `md` up, left-aligned under the page title, with 1.5rem between panels. Each panel is a `Card`, labelled by its header so a screen reader reads it as a region. The theme control is a radio group with one Tab stop. The arrow keys, Home and End move the choice.

### Data and refresh

The Account panel shows the email the session already carries, and reads `GET /users/me` once to keep it current. It does not read while the server is out of reach. The read is cached until an account change invalidates it.

## Features on this page

- [Appearance](../features/appearance.md): what the theme choice does and where it is kept.
- [Authentication](../features/authentication.md): what signing out ends.
