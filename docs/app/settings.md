# Settings

The fourth tab. It holds the choices a person makes rarely: their daily targets, the language of food names, how the app looks, the AI assistants they connect, how they sign in, and their account. It ends with the credit for the food data. Each part is a panel with a small-caps label.

## In detail

### Targets

"Current (from 17 November 2026)" heads the targets that apply today, with the date that change starts on. That heading, when it does not fit on one line, breaks only after "Current". A user whose changes all start after today has no targets today, so there is no Current row, only the "From" rows. The targets show as two lines: **Calories** with its range as "{lower} to {upper} kcal", and **Protein** as "{lower} to {upper} g". The range sits on the right edge. Its figures and its unit are in the monospaced face, and "to" is in the body face. A range that does not fit beside its label drops whole to the line under it, and one that does not fit even there breaks only after "to". Each change still to come follows under a rule, headed "From" and its date, with its own two lines. An **Earlier targets** disclosure, closed at first, lists the changes before the one in force, newest first. It is absent when there are none. Every change, the one in force included, is one row with a chevron, and tapping it opens the targets sheet on that change. A user with no change at all reads "Days show their figures without ranges." in place of the rows.

**Change targets** opens the targets sheet on today. With no change at all, the same button reads **Set targets**. The note "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter." closes the panel. While the targets cannot be read, the panel says "Your targets show here once Hovimestari can reach the server." in place of the rows and the button.

From **Change targets**, the **targets sheet** is titled "Change targets" whatever date is picked. From **Set targets** it is titled "Set targets", and keeps that title while it slides out after the save. Its fields, top to bottom:

- **Starts on**, the device's own date picker, set to today.
- The four fields of the first run, **Calories** and **Protein**, each **From** and **To**. For new targets they open empty and stay empty whatever date is picked. Opened from a row, they hold that change's own targets. [New targets and edited targets](../features/targets.md#new-targets-and-edited-targets) holds the rule.
- A line that names the days the numbers apply to and says what the days before them have, such as "These apply from 18 November 2026 to 30 November 2026. Earlier days keep their targets." or, before every other change, "Earlier days have no targets." It follows the date, is announced to a screen reader, and is empty while the date is not a date. On a date that already has a change, it starts with "This date already has targets. Saving replaces them." The feature doc lists each form it takes.
- The note on advice.

Opened from a row, the sheet edits that change. It is titled "Edit targets", with "Starting on 1 December 2026" under the title in muted body text. That line stays in the header while the body scrolls, and a screen reader reads it as the sheet's description. The body has no date field and starts with **Calories**. It also offers **Remove these targets**, for every change, the only one included, which is locked while a save runs. That asks first, in a confirmation titled "Remove the targets from 1 December 2026?", which says what the change's days then have: "Days from 1 December 2026 to 31 December 2026 are then measured against your earlier targets.", "15 November 2026 is then measured against your earlier targets." for a change that covers one day, or "Days from 1 December 2026 on are then measured against your earlier targets." With no earlier change, its days then have none: "Days from 1 November 2026 to 30 November 2026 will have no targets.", or "Days from 18 November 2026 on will have no targets." for the only change. Its button is **Remove**, which reads "Removing…". A refusal stays in the confirmation, such as "These targets no longer exist." when another device removed the change first. After the only change is removed, the panel shows "Days show their figures without ranges." and the tabs stay.

Errors under the fields are those of [the first run](first-run.md#the-form). A missing date says "Enter a valid date." in the line under the date. A refusal from the server shows above the buttons, such as "A number is too large or has more than one decimal.", and Save works again.

The sheet [holds still](shell.md#the-sheet-primitives) while it is open. Each of its three titles is one line at 320 pixels wide, and the title never changes while the sheet is open. The date and each pair keep one line under them, which every line there fits, so an error moves nothing. The line naming the days starts a section of its own, 16 pixels under the fields, and is as tall as what it says, so picking a date moves only the note under it. At 390 pixels wide it takes two lines, and three with the sentences on replacing. At 320 it takes two or three, and four with them. At 390 by 844 the whole form shows with no scroll. The sheet from Change targets takes its height as it opens. It stands 692 pixels tall on a date with no change of its own, and the sentences on replacing then put the last line of the note on a scroll. Opened on a today that already has a change, it shows those sentences from the start and stands 712. An edit's sheet stands 640, the only change's included. From Set targets it stands 692, as from Change targets. At 320 by 568 the date and all four fields show, with the line and the note on a scroll. While it slides out after a save or a removal, it keeps its title and lines. From `md` the dialog fits a 1280 by 800 screen without scrolling. Save keeps focus while it works and after a failure.

### Food names

Two equal segments, **Finnish** and **English**, the chosen one filled with the accent. A choice is saved at once and shows at once. When the save fails, the choice goes back and the line under the segments says why. Otherwise that line says "Food names show in this language. Search finds a food in either one." [Food-name language](../features/foods.md#food-name-language) says what the choice changes.

### Appearance

Three equal segments: **Light**, **Dark** and **Device**, each with its icon. The chosen one is filled with the accent colour. The change applies at once, and [the choice](../features/appearance.md#choosing-a-theme) belongs to this device.

### Connected AI

The panel opens with "Connect an AI assistant you already use, such as Claude. It reads the same figures you see here." While the server makes keys that can make changes, it adds "A key that can make changes also lets it log and plan for you." Under it is one row per [connection](../features/connected-ai.md#connections-and-keys), newest first, or "No assistant is connected yet." Each row has the connection's name, then a neutral tag, **Read only** or **Read and write**. The next lines say "Expires 19 December 2026" or "Expired 1 November 2026", then "Last used 18 November 2026" or "Not used yet". Each date is the day it falls on in the account's time zone, in the device's language. A read-and-write row adds how many changes its assistant made, "12 changes", "1 change" or "No changes yet". It also adds "Changes are switched off for now. It can only read." while the server makes no key that can make changes, and keeps its tag. Under the facts a read-and-write row has **Activity**, an underlined word in the ink, which opens [its record](#activity). Beside it is **Revoke**, or **Remove** once the key has expired, as an underlined word in the accent. A read-only row says nothing about changes and has no **Activity**.

Under the rows are **Connect an assistant** and **How to connect**. With 10 keys that still work, the [most a person holds](../features/connected-ai.md#connections-and-keys), "You have 10 keys that still work, the most at one time. Revoke one to connect another assistant." stands in the place of the first. An expired row does not count, so the list can show more rows than that. **How to connect** opens the setup steps in place with `YOUR_KEY` where the key goes, and under them "Lost a key? A key is shown only once. Revoke its connection and connect again for a new one."

While the server has [connecting switched off](../features/connected-ai.md#switched-off-on-the-server), a line under the opening, in the panel's muted note style, says "Connecting an assistant is switched off for now. No assistant can reach Hovimestari, and your keys do not work until it is back on." The rows still show with their **Revoke**, and neither **Connect an assistant** nor **How to connect** is offered.

While the list loads, the panel keeps one line's room and shows no buttons. While it cannot be read, it says "Your connections show here once Hovimestari can reach the server." with **Try again** under it. The line and the button stay where they are while it asks again.

**Connect an assistant** opens a sheet of that name. Its fields, top to bottom:

- **Name**, with the hint "Helps you tell connections apart. For example: Claude on my laptop."
- **Access**. While the server makes keys that can make changes, two option cards, **Read only** and **Read and write**, each with a line on what it allows. Read only starts chosen, and the chosen card is outlined in the accent. Otherwise the field is one plain line with nothing to choose: "Read only. The assistant can see your targets, days, foods and saved meals. It cannot change anything."
- **Key expires after**, the device's own select, with 7 days, 30 days, 90 days and 1 year, 30 days chosen. For Read and write it follows [the shorter lifetimes](../features/connected-ai.md#access-and-lifetime), without 1 year, and the line under it says "A key that can make changes lasts at most 90 days."
- **Before you connect**, a panel that lists what the assistant can do with the key, that what it reads goes to the company that runs it, that its barcode lookups share the person's hourly limit, that the key is a secret, and that its answers are its own and are not nutrition or medical advice. The read-and-write panel also says the assistant is told to ask before each change and that each change is recorded under the connection's name. A box closes the panel: "I understand and I want to connect.", or "I understand it can change my data, and I want to connect." for Read and write.

**Create key**, which reads "Creating…", stays off until there is a name and the box is ticked. The box is ticked for one access at a time. Ticked for Read only, it shows unticked on Read and write, and ticked again back on Read only. A refused name shows under **Name**. Any other refusal shows above the buttons, such as "You already have 10 keys that still work. Revoke one first.", "Changes by an assistant are switched off for now." or "Could not create the key." Every failure reads the panel again. So the form and the panel follow what the server offers, and a key the server made before its answer was lost shows as a row to revoke.

When the key is made, the sheet closes and **Your key** opens in its place. It says "Copy it now. It is shown only once." over the key in its own box, with **Copy** under it, which reads "Copied" for two seconds. The key breaks over lines between any two characters, never just after a hyphen, and its last line holds at least its last four characters. When the browser refuses the clipboard, the key is selected and "Select the key and copy it." shows under it and is announced. **Set up your assistant** follows, with the same setup steps as How to connect, holding the real key. Then "If you lose the key before you use it, revoke this connection and connect again. That makes a new key." The one button is **I have copied it**. Escape, a press outside and a swipe leave the sheet where it is, with the same key. Leaving Settings with it open and coming back opens it again with the same key. Making the key leaves the panel behind it as it was. A read of the list while the key is up, such as the one when the person comes back from their terminal, can already show the new row there. Otherwise the new row joins the list once **I have copied it** is pressed. Focus moves from that button straight to the row, and the page scrolls only as far as it takes to show the row with a little room above it. [Showing a new key](../features/connected-ai.md#showing-a-new-key) says when the key goes.

The setup steps offer two segments, **Claude Code** and **Claude Desktop**. Claude Code says "Run this in a terminal." over the `claude mcp add` command, with **Copy** and the hint "Add --scope user to use it in every project." Claude Desktop says where to add the entry in Claude's config file and that it needs Node.js, over the entry to paste, with **Copy**. When the browser refuses the clipboard, the command or the entry is selected and "Select the text and copy it." shows and is announced. The command and the entry wrap inside their own box. Each **Copy** names for a screen reader what it copies: "Copy the key", "Copy the command" or "Copy the entry".

Under everything else, **Past connections** lists each revoked key that made changes, with a rule above the heading. A row gives the name, then "4 changes" and "Last change 18 November 2026", then **Activity**. It has no **Revoke** and no setup steps, because the key no longer works. The heading is absent while no revoked key made changes.

**Revoke** asks first, titled "Revoke Claude on my laptop?": "The assistant loses access right away. You can connect it again with a new key." A read-and-write key adds "What it changed stays, and so does its record." Its button is **Revoke**, which reads "Revoking…". **Remove** asks "Remove Old laptop?" with "This key has expired and no longer works. Removing it takes it off this list.", and its button is **Remove**. A key already revoked on another device counts as done. A failure stays in the confirmation as "Could not revoke the connection." or "Could not remove the connection."

### Activity

**Activity** opens a sheet titled "Changes by Claude on my laptop", with "Everything this connection changed, newest first." under the title. It shows the connection's [record of changes](../features/connected-ai.md#the-record-of-changes) and says "Loading the changes…" until the first page is in. A connection whose row counts more than three changes opens a tall sheet, which keeps its height while the list lands. One that counts three or fewer opens as tall as its changes. Each change has three parts, with a rule between changes:

- What was changed, in semibold, such as "Planned Oat porridge", "Marked 3 entries eaten", "Changed the meal Chicken bowl" or "Set targets from 1 December 2026".
- Its details in the monospaced face, one line each, such as "For 21 November 2026 · 150 g · 98 kcal · 16.5 g protein", "Amount: 150 g to 200 g" or "Replaced: Calories 1900 to 2300 kcal · Protein 130 to 170 g". Figures that changed take two lines, "Figures, before: …" and "Figures, after: …". A line's label is in the muted ink. A favourite or an archive has no details.
- When it was made, "19 November 2026 at 14:32", in the muted ink, in the account's time zone and the device's language.

The record is plain text in the ink and the muted ink. A part of a line keeps together while it fits, so a figure stays with its unit and each dot stays with the part after it. A long name wraps inside its line. A screen reader hears each change as one sentence: what happened, its details as a list, then when. It hears copied names joined by "and", since a name can hold a comma.

**Show more** under the list adds the next page below the changes on screen, which stay where they are, and reads "Loading…" while it works. Focus then moves to the first new change, and the sheet scrolls only as far as it takes to show it. A screen reader hears "50 more changes shown". The button goes once the last page is in. A page that fails says "Could not load more." under the button, which reads **Try again** and keeps focus, and a screen reader hears that line too. A connection with no changes says "This connection has not changed anything yet.", in a sheet as tall as that line. A first page that fails says "Could not load the changes." with **Try again** under it. Once **Try again** brings the first page in, focus moves to the first change, or to the sheet's body when there is none. [Reading the record](../features/connected-ai.md#reading-the-record) holds the paging rules.

The sheet's body takes focus as it opens, at every width, so a screen reader starts at the title and the line under it. A focused change has the app's focus ring 2 pixels outside it, clear of its text. **Close** in the footer, Escape, a press outside and a swipe all close the sheet, and focus goes back to the row's **Activity**.

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

A second paragraph credits the products looked up by barcode: "Product data comes from Open Food Facts, available under the Open Database License. Hovimestari is not produced or endorsed by Open Food Facts." **Open Food Facts** links to openfoodfacts.org and **Open Database License** to the licence, each in a new tab. A screen reader hears "(opens in a new tab)" after each of the four links. Its terms come from [Open Food Facts' licence](../features/foods.md#open-food-facts). Every Open Food Facts food's detail links here too.

### On a phone

The panels fill the width, and every button is a full-width 48 pixel target. Activity, Revoke and Remove are underlined words with a 44 pixel target. Each targets row is at least 44 pixels tall. On a phone narrower than 372 pixels, each theme segment's icon sits above its label, so all three fit. The sheets slide up from the bottom with a drag handle, and their two buttons sit side by side at the bottom, above the keyboard while one is up. [The app shell](shell.md#sheets-and-dialogs) says how every sheet behaves.

## How it works

### Route and entry

`/settings`, in `apps/web/src/app/(app)/settings/`. The page composes seven sections from its `_components/` folder: `TargetsSection`, `FoodNamesSection`, `AppearanceSection`, `ConnectedAiSection`, `SignInMethodsSection`, `AccountSection` and `FoodDataSection`. The food data panel carries the id `food-data`, so `/settings#food-data` lands on it. The sheets are `ChangePasswordSheet` and `AddPasswordSheet` beside them, `DeleteAccountSheet` with the Sign out and Delete account buttons in `apps/web/src/components/account/`, and `TargetsSheet` in `apps/web/src/components/targets/`. Each sheet is a [`FormSheet`](shell.md#the-sheet-primitives), `CreateConnectionSheet` included. The key reveal, `KeyRevealSheet`, is a `BottomSheet` that cannot be dismissed. It is mounted once, in `ConnectedAiSection`, and opens while `ConnectionRevealProvider` in `apps/web/src/components/` holds a key. A connection's record is `ConnectionActivitySheet`, a `BottomSheet` with no field, also mounted once in `ConnectedAiSection`. The removals, revoking a connection and sign-out on all devices use `ConfirmDialog`. Removing a targets change stacks its confirmation on the targets sheet.

### Layout

One column, the shell's 40rem from `md` up, with 1.5rem between panels. From `md` the targets sheet is a `md:max-w-md` dialog, so its paired fields and the line naming the days fit without scrolling. The Activity sheet is a `md:max-w-xl` dialog, 576 pixels wide, so an added entry's details fit on one line. A portion's amount, such as "2 × Medium piece · 110 g", makes the line longer, and it takes two. On a phone an entry's details take two lines, and a line breaks only between its parts. Each panel is a `Card`, labelled by its header so a screen reader reads it as a region. Each method row is a group labelled by its name. The theme control is a radio group with one Tab stop.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone a sheet's body takes focus as it opens, and from `md` its first field does. The Activity sheet has no field, so its body takes focus at every width. **Your key** opens on its **Copy** at every width. A confirmation opens on **Cancel**. Closing puts focus back on the button that opened it. After a removal, and after Add password, focus moves to that method's row instead, because the button that was pressed is gone or has changed. After a connection is revoked or removed, focus moves to the next row's Revoke, else the row before, else **Connect an assistant**, else **How to connect**. After **I have copied it**, focus moves to the new row, which is scrolled into view. When Settings came back before its list, focus moves there once the row is listed. After a targets change is removed, focus moves to **Change targets**, because the row that opened the sheet is gone. It stays there when the panel then changes, such as when no change is in force any more, or none is left and the button reads **Set targets**. In the food-name segments, as in the theme's, the arrow keys move the choice. A refusal that names a field puts focus in that field.

### Data and refresh

The sections show the account the session already carries, and read `GET /users/me` to keep it current. They do not read while the server is out of reach. Every account change refreshes the read through `afterAccountChange` in `apps/web/src/lib/invalidation.ts`. Whether to show Google comes from `GET /auth/providers`, read once.

Connected AI reads `GET /connections`, which also says whether the server offers connecting and keys that can make changes, and reads it again when the page is shown. **Create key** sends `POST /connections`, and its answer goes only to the reveal store. The list is read again after **I have copied it**, and after any create that fails. **Revoke** and **Remove** send `DELETE /connections/<id>`, and the list is read again. **Activity** reads `GET /connections/<id>/changes` afresh on each open, a page at a time, with **Show more** sending the cursor of the page before. Opening it also reads the list again, so the row's count agrees with the record. The setup steps point at `/mcp` on the backend's origin.

Targets read `GET /targets`, the same read as the first-run gate. The sheet opened from a row fills its fields from that change in that answer. Saving sends `PUT /targets/<date>`, removing `DELETE /targets/<date>`, and both refresh every targets read. Food names send `PATCH /users/me/settings`, drop every food read not on screen, so nothing shows in the old language, and refresh the account and the rest. Dates show in the device's language, and figures never group digits, so what shows can be typed back into a field.

Each account action calls the backend: `PUT /users/me/password`, `POST /auth/link/password`, `DELETE /auth/unlink/:method`, `POST /auth/logout-all` and `DELETE /users/me`. Linking Google goes through the app's own `POST /api/auth/google/link/start`. [Authentication](../features/authentication.md) holds the rules behind each.

### Known gaps

- On a phone, an Activity sheet for three changes or fewer keeps the height of its loading line when its first page lands after the sheet has opened, and its changes then scroll inside it.

## Features on this page

- [Targets](../features/targets.md): the ranges, dated changes, which days a change covers, and removing one.
- [Foods](../features/foods.md): the food-name language and the credit for Fineli's and Open Food Facts' data.
- [Appearance](../features/appearance.md): what the theme choice does and where it is kept.
- [Connected AI](../features/connected-ai.md): connection keys, their access and lifetime, the switches on the server, showing a new key once, and the record of changes.
- [Authentication](../features/authentication.md): the sign-in methods, changing the password, signing out everywhere, linking Google and deleting the account.
