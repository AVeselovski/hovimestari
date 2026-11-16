# First run

The page a new account sees instead of the tabs, until it has targets. It asks for the two daily ranges in the person's own numbers, and the tabs follow on the same address once they are saved. Signing out and deleting the account stay within reach, so nobody has to invent targets to leave.

## In detail

### The form

The wordmark, then the title "Your daily targets" and the lead "Enter the ranges you aim for each day. You can change them at any time."

Two groups follow, **Calories** and **Protein**, each a pair of fields side by side, **From** and **To**, with the unit inside each field: kcal or g. Under Protein sits the line "The lower number is your floor." Every field starts empty and has no example in it. Under the fields sits the note "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter."

**Save targets** sends the two ranges, and reads "Saving…" while it works. The fields are locked until it answers. The ranges take effect today. [Targets](../features/targets.md#setting-your-targets) holds the rules a range must keep.

A range that breaks a rule says so in the line under its pair, and focus moves to the first field to fix:

- An empty field: "Enter a number."
- Zero: "Enter a number above zero."
- A lower number above the upper one: "The second number cannot be below the first." Focus goes to To.
- Anything that is not a number with at most one decimal under the limit: "Enter a number below 100000, with one decimal at most." for calories and "Enter a number below 10000, with one decimal at most." for protein.
- A number that may mean thousands, such as "1,800": "This may mean thousands. Type it with no comma or point, or with fewer decimals."

A refusal from the server shows its line above the button, such as "A number is too large or has more than one decimal.", and Save works again.

### Leaving

Under a rule: "Signed in as" with the account's email, then two text buttons. **Sign out** signs this device out. **Delete account** opens the same sheet as in [Settings](settings.md#account), and works the same way.

### Before it shows

While the app first asks whether the account has targets, a spinner fills the screen.

### Without a connection

The page never shows because a request failed. Opened offline, the app shows the tabs with "You are offline." under the header, and this page comes at the first answer that says the account has no targets. [The first-run gate](../features/targets.md#the-first-run-gate) holds the rule.

### On a phone

No field takes focus as the page loads, so no keyboard rises on its own. The page scrolls, and **Save targets** sits in the flow under the fields. Calories fields bring up the number keypad and protein fields the decimal one. Both accept a comma or a point as the decimal separator.

## How it works

### Route and entry

The page has no route. `TargetsGate` in `apps/web/src/components/targets/` sits between the query cache and the shell in `apps/web/src/app/(app)/layout.tsx`. It reads `GET /targets` under a key with no date, and shows this page, `FirstRunTargets`, or the shell by [the first-run gate](../features/targets.md#the-first-run-gate). The read is enabled only while the session is signed in. A real offline start goes through the session's offline status, so the read never runs and the shell shows. Any address under the tabs lands here while the account has no targets, and stays the same address after the save.

### Layout

The guest pages' frame, `AuthPage`: one column, 26rem wide from `md`, anchored to the top, with the offline line at the top while the app is offline. From `md` the first field takes focus on load. The two fields of a pair are equal halves. Each pair keeps the room of its longest line under it whether or not it holds anything, two lines on a phone and one from `md`, so an error appearing moves nothing below it. The line above the button keeps two lines. The form is named by the page title. The text buttons are 44 pixels tall.

### Data and refresh

Save sends `PUT /targets/<today>`, with today from the targets answer the gate already holds, which the server reads in the account's time zone. It then invalidates every targets read. The gate's read answers a change, and the shell replaces this page. When that read fails, the page stays and Save works again, sending the same change.

The gate also stores the device's time zone on the account, once per app start, when the two differ ([Today and the time zone](../features/targets.md#today-and-the-time-zone)).

## Features on this page

- [Targets](../features/targets.md): the ranges, their rules and the first run.
- [Authentication](../features/authentication.md): signing out and deleting the account.
