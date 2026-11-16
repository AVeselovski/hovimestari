# Settings

The fourth tab. It holds the choices a person makes rarely: how the app looks, how they sign in, and their account. Each part is a panel with a small-caps label.

## In detail

### Appearance

Three equal segments: **Light**, **Dark** and **Device**, each with its icon. The chosen one is filled with the accent colour. The change applies at once, and [the choice](../features/appearance.md#choosing-a-theme) belongs to this device.

### Sign-in methods

One row per way in, each with its name, its state on the right and its buttons under it. A plain rule separates the two rows.

- **Password**, "Set" or "Not set". With a password: **Change password**. Without one: **Add password**.
- **Google**, "Connected" or "Not connected". Without Google: **Link Google account**, which reads "Opening Google…" and leaves for Google's consent screen. The row is there only while this deployment offers Google, or while the account already has it.
- With both methods, each row also offers its removal: **Remove password** and **Unlink Google**, outlined in the accent. With one method no row offers a removal, because [the last way in](../features/authentication.md#sign-in-methods) always stays.

**Change password** opens a sheet titled "Change password". It asks for **Current password** and **New password**, with the hint "At least 8 characters.", and saves with **Save**, which reads "Saving…" while it works. A wrong current password says so under that field. When this device cannot sign back in with the new password, it lands on the sign-in page with the note "Password updated. Sign in with your new password."

**Add password** opens a sheet titled "Add a password", which says "Sign in with your email and this password as well as with Google." It asks for **New password** only, with the same hint, and the same **Save**.

Each removal asks first, in a confirmation:

- "Remove your password?", with "You will sign in with Google only." and the button **Remove password**, which reads "Removing…".
- "Unlink Google?", with "You will sign in with your email and password only." and the button **Unlink Google**, which reads "Unlinking…".

A removal that fails keeps the confirmation open with the reason in it, so pressing the button again retries. When the other method is already gone, removed on another device or tab, it says "You cannot remove your only way to sign in." and the rows are read again, so they stop offering the removal.

After each change, a line under the rows says what happened:

- "Password changed. Other devices sign out within 15 minutes."
- "Password added. You can now sign in with your email and this password."
- "Password removed. You sign in with Google."
- "Google unlinked. You sign in with your email and password."

Only the password change mentions other devices, because only it [ends their sessions](../features/authentication.md#sign-in-methods).

Coming back from Google, the line says "Google is connected.", "That Google account is already linked to another account.", "Google is already connected to this account." or "Google could not be connected. Try again." The result is then taken off the address, so a reload does not say it again. When the link cannot start, the line gives the reason and the button reads **Link Google account** again. A line that reports a failure is in the accent.

### Account

"Signed in as" with the account's email in bold.

- **Sign out** ends the session on this device and reads "Signing out…" while it works.
- **Sign out on all devices** asks first, titled "Sign out on all devices?": "This device signs out now. Other devices sign out within 15 minutes." Its button is **Sign out**, filled in the accent, which reads "Signing out…" while it works. When the server cannot be reached, the confirmation stays open and says "Could not sign out other devices. Check your connection and try again.", and nothing changes.
- Under a rule, **Delete account**, outlined in the accent. It opens a sheet titled "Delete your account?" that says "This deletes your account and everything in it. It cannot be undone." A password account types its **Password**. A Google-only account types its address under "Type your email to confirm". The sheet's **Delete account** button stays disabled until the field is filled, and reads "Deleting…" while it works. On a phone it takes a press only once the sheet has come to rest, so a double tap on the button that opened it cannot delete anything. A wrong confirmation says "That password is not right. Check it and try again." or "That is not this account's email. Check it and try again." under the field. Afterwards the browser lands on the sign-in page with the note "Your account and everything in it are deleted."

A long email wraps before its "@" or a dot rather than mid-word.

### While the account is unknown

On a launch with no server in reach and no session confirmed yet, the Sign-in methods panel is absent. Account says "Last signed in as" with the address this device remembers, so it never claims the session was just checked, and offers **Sign out** alone. A device that remembers no address shows **Sign out** alone.

### On a phone

The panels fill the width, and every button is a full-width 48 pixel target. On a phone narrower than 372 pixels, each theme segment's icon sits above its label, so all three fit. The sheets slide up from the bottom with a drag handle, and their two buttons sit side by side at the bottom, above the keyboard while one is up. [The app shell](shell.md#sheets-and-dialogs) says how every sheet behaves.

## How it works

### Route and entry

`/settings`, in `apps/web/src/app/(app)/settings/`. The page composes three sections from its `_components/` folder: `AppearanceSection`, `SignInMethodsSection` and `AccountSection`. The sheets are `ChangePasswordSheet`, `AddPasswordSheet` and `DeleteAccountSheet` beside them, each a [`FormSheet`](shell.md#the-sheet-primitives). The removals and sign-out on all devices use `ConfirmDialog`.

### Layout

One column, the shell's 40rem from `md` up, with 1.5rem between panels. Each panel is a `Card`, labelled by its header so a screen reader reads it as a region. Each method row is a group labelled by its name. The theme control is a radio group with one Tab stop.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone a sheet's body takes focus as it opens, and from `md` its first field does. A confirmation opens on **Cancel**. Closing puts focus back on the button that opened it. After a removal, and after Add password, focus moves to that method's row instead, because the button that was pressed is gone or has changed. A refusal that names a field puts focus in that field.

### Data and refresh

The sections show the account the session already carries, and read `GET /users/me` to keep it current. They do not read while the server is out of reach. Every account change refreshes the read through `afterAccountChange` in `apps/web/src/lib/invalidation.ts`. Whether to show Google comes from `GET /auth/providers`, read once.

Each action calls the backend: `PUT /users/me/password`, `POST /auth/link/password`, `DELETE /auth/unlink/:method`, `POST /auth/logout-all` and `DELETE /users/me`. Linking Google goes through the app's own `POST /api/auth/google/link/start`. [Authentication](../features/authentication.md) holds the rules behind each.

## Features on this page

- [Appearance](../features/appearance.md): what the theme choice does and where it is kept.
- [Authentication](../features/authentication.md): the sign-in methods, changing the password, signing out everywhere, linking Google and deleting the account.
