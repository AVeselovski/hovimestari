# First run

The page a new account sees once, instead of the tabs. It asks for the two daily ranges in the person's own numbers, or lets them go on without targets, and the tabs follow on the same address either way. A user with no targets can open it again from any day.

## In detail

### The form

The wordmark, then the title "Your daily targets" and the lead "Enter the ranges you aim for each day. They apply from today, and you can change them in Settings at any time."

Two groups follow, **Calories** and **Protein**, each a pair of fields side by side, **From** and **To**, with the unit inside each field: kcal or g. Under Protein sits the line "The lower number is your floor." Every field starts empty and has no example in it, because the person has no targets yet. Under the fields sits the note "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter."

**Save targets** sends the two ranges, and reads "Saving…" while it works. The ranges take effect today. [Targets](../features/targets.md#setting-your-targets) holds the rules a range must keep.

**Continue without targets** sits 16 pixels under Save, a plain text button across the column in ink, underlined, with no fill. It goes on to the app with no targets, and reads "Continuing…" while it works. While either button works, both and the fields are locked.

A range that breaks a rule says so in the line under its pair, and focus moves to the first field to fix:

- An empty field: "Enter a number."
- Zero: "Enter a number above zero."
- A lower number above the upper one: "To cannot be lower than From." Focus goes to To.
- Anything that is not a number with at most one decimal under the limit: "Enter below 100000, one decimal at most." for calories and "Enter below 10000, one decimal at most." for protein.
- A number that may mean thousands, such as "1,800": "No comma or point, or fewer decimals."

A refusal from the server shows its line above Save, such as "A number is too large or has more than one decimal.", and both buttons work again. After a refused save, focus goes back to the first field. After a refused Continue without targets, it goes back to that button. The line is announced. On a phone that line keeps no room: Save sits 16 pixels under the note about advice, and a refusal moves both buttons down by its height. The refusal, Save and a refused Continue are scrolled into view together above the keyboard. From `md` the line keeps two lines of room, so the buttons never move. The note sits 16 pixels under the ranges, as in the targets sheet.

### Opened again from a day

A user with no targets reaches the page again through **Set targets** on [the Day tab](day.md#the-summary). It opens at the press, also offline. It is the same page with the same copy, on the same address. Every way out returns to the day it was opened on, at the top, with focus on the date button:

- **Continue without targets** goes back at once.
- The browser's or the phone's Back closes the page, and Forward opens it again.
- A successful save goes back once the change is stored and the day has its new answer, after 2 seconds at most. Its targets start today, so a past day still shows its figures without ranges, with the line that names today.
- When another device has saved targets meanwhile, the page goes back by itself as soon as the app learns it, and the day shows its targets.

A refused save keeps the page with its refusal. A reload while the page is open shows it again. [The first-run gate](../features/targets.md#the-first-run-gate) holds the rules.

### Before it shows

While the app first asks whether the first run is due, a spinner fills the screen.

### Without a connection

The page never shows because a request failed. Opened offline, the app shows the tabs with "You are offline." under the header, and this page comes at the first answer that says the first run is due. [The first-run gate](../features/targets.md#the-first-run-gate) holds the rule.

On the page, "You are offline." shows at the top while the device is offline. Save and Continue without targets then keep the page and show "You are offline. Changes need a connection." above Save, as every form does, and both work again. Opened again from a day, Continue without targets sends nothing, so it goes back offline too.

### On a phone

No field takes focus as the page loads, so no keyboard rises on its own. The page title takes focus instead, with no ring after a tap, so a screen reader starts there. The page scrolls, and both buttons sit in the flow under the fields. Calories fields bring up the number keypad and protein fields the decimal one. Both accept a comma or a point as the decimal separator.

## How it works

### Route and entry

The page has no route. `TargetsGate` in `apps/web/src/components/targets/` sits between the query cache and the shell in `apps/web/src/app/(app)/layout.tsx`. It reads `GET /targets` under a key with no date, and shows this page, `FirstRunTargets`, or the shell by [the first-run gate](../features/targets.md#the-first-run-gate). The read is enabled only while the session is signed in. A real offline start goes through the session's offline status, so the read never runs and the shell shows. Any address under the tabs lands here while the first run is due, and stays the same address after it.

Opened again, the page is a history entry the gate pushed on the same address. The gate passes `onLeave`, which goes Back, and the shell mounts again on the way back.

### Layout

The guest pages' frame, `AuthPage`: one column, 26rem wide from `md`, anchored to the top, with the offline line at the top while the app is offline. From `md` the first field takes focus on load. The two fields of a pair are equal halves. Each pair keeps one line of room under it whether or not it holds anything, and every line it can show fits that line at 320 pixels wide, so an error appearing moves nothing below it. The groups stand 16 pixels apart, and so does the note under them. The line above the buttons keeps no room on a phone and two lines from `md`. Measured on a production build at 390 by 844 and at 320 wide, Save runs from 625 to 673 pixels from the top and Continue without targets from 689 to 733. At 390 by 844 both are in view. At 320 by 568 and 1280 by 800 they follow on a short scroll. The form is named by the page title. Save is 48 pixels tall and Continue without targets 44.

### Data and refresh

Save sends `PUT /targets/<today>`, with today from the targets answer the gate already holds, which the server reads in the account's time zone. It then reads every targets answer again. Shown by itself, the page gives way to the shell once that read answers a change. When the read fails, the page stays and Save works again, sending the same change. Opened again from a day, it puts the saved change into the targets the app holds, then goes back once the targets and that day are read again, after 2 seconds at most and at once while offline. The other days held are read without waiting for them.

Continue without targets, on the page shown by itself, sends `PUT /users/me/first-run` and then reads the targets again. The answer says the first run is no longer due, and the shell replaces the page, with focus on the Day tab's date button. Opened again from a day, it sends nothing.

When a save or Continue on the page shown by itself lands just before the connection drops, the page waits for the connection under the offline line, then gives way to the tabs.

The gate also stores the device's time zone on the account, once per app start, when the two differ ([Today and the time zone](../features/targets.md#today-and-the-time-zone)).

## Features on this page

- [Targets](../features/targets.md): the ranges, their rules, the first run and going on without targets.
