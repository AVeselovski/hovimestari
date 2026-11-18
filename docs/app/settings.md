# Settings

The fourth tab. It holds the choices a person makes rarely: their daily targets, the language of food names, how the app looks, how they sign in, and their account. It ends with the credit for the food data. Each part is a panel with a small-caps label.

## In detail

### Targets

"In force today" heads the targets that apply today, as two lines: **Calories** with its range as "{lower} to {upper} kcal", and **Protein** as "{lower} to {upper} g". The range sits on the right edge in the monospaced face. A range that does not fit beside its label drops whole to the line under it, and one that does not fit even there breaks only after "to". Each change still to come follows under a rule, headed "From" and its date, with its own two lines. An **Earlier targets** disclosure, closed at first, lists the changes before the one in force, newest first. It is absent when there are none. Every change, the one in force included, is one row with a chevron, and tapping it opens the targets sheet on that change.

**Change targets** opens the targets sheet on today. The note "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter." closes the panel. While the targets cannot be read, the panel says "Your targets show here once Hovimestari can reach the server." in place of the rows and the button.

The **targets sheet** is titled "Change targets", or "Targets from {date}" when the date already has a change. Its fields, top to bottom:

- **Starts on**, the device's own date picker, set to today.
- Directly under the date, a line with the targets in force on that date: "In force on {date}: {energyLower} to {energyUpper} kcal, {proteinLower} to {proteinUpper} g protein." It follows the date as it changes, is announced to a screen reader, and is empty while the date is not a date.
- The four fields of the first run, **Calories** and **Protein**, each **From** and **To**. Every one opens empty, with no example in it. The targets in force appear in the line above and never in a field.
- When the save changes days that already have targets, a line that says which: "This changes the targets for every day from 16 November 2026 on.", "This changes the targets for every day from 1 November 2026 to 30 November 2026.", "This changes the targets for 15 November 2026." for a single day, "This changes the targets for every day before 1 December 2026." when the date comes before every change, or "This changes the targets for every day." It is announced to a screen reader as the date changes. A new change on a future date after an earlier change has no such line. [Changing your targets](../features/targets.md#changing-your-targets) holds the rule for which days a save rewrites.
- The note on advice.

Picking a date that already has a change makes the sheet edit that change, and the title says so: "Targets from 1 December 2026". Opened from a row, the sheet edits that change, and its date is text rather than a field. While the account has more than one change, it also offers **Remove these targets**, which is locked while a save runs. That asks first, in a confirmation titled "Remove the targets from 1 December 2026?", which says where the days go: "Days from 1 December 2026 to 31 December 2026 are then measured against your earlier targets.", "15 November 2026 is then measured against your earlier targets." for a change that covers one day, "Days from 1 December 2026 on are then measured against your earlier targets." or, for the first change, "Days before 1 January 2027 are then measured against the targets from 1 January 2027." Its button is **Remove**, which reads "Removing…". A refusal stays in the confirmation, such as "You need at least one set of targets." when another device removed the other change first.

Errors under the fields are those of [the first run](first-run.md#the-form). A missing date says "Enter a valid date." under the date, in the in-force line's place. A refusal from the server shows above the buttons, such as "A number is too large or has more than one decimal.", and Save works again.

The sheet [holds still](shell.md#the-sheet-primitives) while it is open. The title and the in-force line keep the room of their longest form at 320 pixels wide. The line under each pair keeps one line, which every line there fits, so an error moves nothing. The rewrite line starts a section of its own, 16 pixels under the fields, and is as tall as what it says, so picking a date moves only the note under it. While it is empty the note sits 16 pixels under the fields. At 390 by 844 the whole form shows with no scroll, and the sheet stands 724 pixels tall. At 375 by 667 the rewrite line is the last line in view, and at 320 by 568 the Calories and Protein fields, with the rest on a scroll. While it slides out after a save or a removal, it keeps its title and lines. From `md` the dialog fits a 1280 by 800 screen without scrolling. Save keeps focus while it works and after a failure.

### Food names

Two equal segments, **Finnish** and **English**, the chosen one filled with the accent. A choice is saved at once and shows at once. When the save fails, the choice goes back and the line under the segments says why. Otherwise that line says "Search finds foods by either name." [Food-name language](../features/foods.md#food-name-language) says what the choice changes.

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
- Under a rule, **Delete account**, outlined in the accent. It opens a sheet titled "Delete your account?" that says "This deletes your account and everything in it. It cannot be undone." A password account types its **Password**. A Google-only account types its address under "Type your email to confirm". The sheet's **Delete account** button stays disabled until the field is filled, and reads "Deleting…" while it works. On a phone it takes a press only once the sheet has come to rest, so a double tap on the button that opened it cannot delete anything. A wrong confirmation says "That password is not right. Try again." or "That is not this account's email. Try again." under the field. Afterwards the browser lands on the sign-in page with the note "Your account and everything in it are deleted."

A long email wraps before its "@" or a dot rather than mid-word.

### While the account is unknown

On a launch with no server in reach and no session confirmed yet, the Sign-in methods panel is absent. Account says "Last signed in as" with the address this device remembers, so it never claims the session was just checked, and offers **Sign out** alone. A device that remembers no address shows **Sign out** alone.

### Food data

The last panel credits the food data: "Food composition data comes from Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). It is used under the Creative Commons Attribution 4.0 licence. Hovimestari converts its energy values from kilojoules to kilocalories. Hovimestari is not produced or endorsed by THL." **Fineli** links to Fineli's site and **Creative Commons Attribution 4.0** to the licence, each in a new tab. Its terms come from [Fineli's licence](../features/foods.md#fineli). Every Fineli food's detail in [the log sheet](log-sheet.md#a-food) links here.

### On a phone

The panels fill the width, and every button is a full-width 48 pixel target. Each targets row is at least 44 pixels tall. On a phone narrower than 372 pixels, each theme segment's icon sits above its label, so all three fit. The sheets slide up from the bottom with a drag handle, and their two buttons sit side by side at the bottom, above the keyboard while one is up. [The app shell](shell.md#sheets-and-dialogs) says how every sheet behaves.

## How it works

### Route and entry

`/settings`, in `apps/web/src/app/(app)/settings/`. The page composes six sections from its `_components/` folder: `TargetsSection`, `FoodNamesSection`, `AppearanceSection`, `SignInMethodsSection`, `AccountSection` and `FoodDataSection`. The food data panel carries the id `food-data`, so `/settings#food-data` lands on it. The sheets are `ChangePasswordSheet` and `AddPasswordSheet` beside them, `DeleteAccountSheet` with the Sign out and Delete account buttons in `apps/web/src/components/account/`, which the first-run page shares, and `TargetsSheet` in `apps/web/src/components/targets/`. Each sheet is a [`FormSheet`](shell.md#the-sheet-primitives). The removals and sign-out on all devices use `ConfirmDialog`. Removing a targets change stacks its confirmation on the targets sheet.

### Layout

One column, the shell's 40rem from `md` up, with 1.5rem between panels. The targets sheet is a `md:max-w-md` dialog from `md`, wider than the others, so its paired fields and its date lines fit without scrolling. Each panel is a `Card`, labelled by its header so a screen reader reads it as a region. Each method row is a group labelled by its name. The theme control is a radio group with one Tab stop.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone a sheet's body takes focus as it opens, and from `md` its first field does. A confirmation opens on **Cancel**. Closing puts focus back on the button that opened it. After a removal, and after Add password, focus moves to that method's row instead, because the button that was pressed is gone or has changed. After a targets change is removed, focus moves to **Change targets**, because the row that opened the sheet is gone. In the food-name segments, as in the theme's, the arrow keys move the choice. A refusal that names a field puts focus in that field.

### Data and refresh

The sections show the account the session already carries, and read `GET /users/me` to keep it current. They do not read while the server is out of reach. Every account change refreshes the read through `afterAccountChange` in `apps/web/src/lib/invalidation.ts`. Whether to show Google comes from `GET /auth/providers`, read once.

Targets read `GET /targets`, the same read as the first-run gate, and the sheet's in-force line reads `GET /targets?date=` for its date, so the app never applies the in-force rule itself. Saving sends `PUT /targets/<date>`, removing `DELETE /targets/<date>`, and both refresh every targets read. Food names send `PATCH /users/me/settings`, drop every food read not on screen, so nothing shows in the old language, and refresh the account and the rest. Dates show in the device's language, and figures never group digits, so what shows can be typed back into a field.

Each account action calls the backend: `PUT /users/me/password`, `POST /auth/link/password`, `DELETE /auth/unlink/:method`, `POST /auth/logout-all` and `DELETE /users/me`. Linking Google goes through the app's own `POST /api/auth/google/link/start`. [Authentication](../features/authentication.md) holds the rules behind each.

## Features on this page

- [Targets](../features/targets.md): the ranges, dated changes, which days a change covers, and removing one.
- [Foods](../features/foods.md): the food-name language and the credit for Fineli's data.
- [Appearance](../features/appearance.md): what the theme choice does and where it is kept.
- [Authentication](../features/authentication.md): the sign-in methods, changing the password, signing out everywhere, linking Google and deleting the account.
