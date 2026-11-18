# Sign-in and account pages

The pages a signed-out visitor uses: sign in, create an account, ask for a password reset link and choose a new password. Each is a full page with one centred column, built for a phone first. A signed-in visitor who opens sign-in, sign-up or the reset request goes straight on into the app. The page that chooses a new password opens either way.

## In detail

### Sign in

The page is titled "Sign in", under the Hovimestari wordmark and the dashed rule. It asks for **Email** and **Password**, with a full-width **Sign in** button that reads "Signing in…" while it works. Under the form, "Forgot your password?" leads to the reset page and "Create an account" to sign-up.

When the deployment has Google, a **Continue with Google** button sits above the form, with a quiet "or" between the two.

A note above the form explains how the visitor arrived:

- after a password reset, "Password updated. Sign in with your new password."
- after deleting the account, "Your account and everything in it are deleted."
- after a Google sign-in that did not finish, the line for its reason, such as "Signing in with Google did not work. Try again, or sign in with your email and password."

### Create an account

Titled "Create an account". It asks for **Email** and **Password** only, with the hint "At least 8 characters." under the password. The button reads **Create account**, then "Creating account…". "Already have an account? Sign in" leads back. Google appears here too when the deployment has it.

### Reset your password

Titled "Reset your password". It asks for **Email** and sends a link with **Send reset link**. The answer is always the same, whether or not the address has an account: "If an account exists with that email address, you will receive a password reset link shortly." "Back to sign in" leads back.

### Choose a new password

The page the emailed link opens, titled "Choose a new password". It asks for **New password**, with the hint "At least 8 characters.", and **Repeat the new password**, and saves with **Save password**. Two passwords that differ get "The passwords do not match." The page opens whether or not this browser is signed in. After a saved password, a signed-in device [signs out](../features/authentication.md#forgotten-password), and the browser lands on the sign-in page with its note. A spent, expired or missing link says "This password reset link is invalid or has expired." with "Ask for a new reset link".

### Errors

A field's problem shows as a line under that field, such as "Enter a valid email address." or "Use at least 8 characters.", and the field is marked invalid. A refusal from the server shows as a line above the button, such as "Invalid email or password." or "Too many sign-in attempts. Try again in 15 minutes." When the server cannot be reached the line says "Hovimestari cannot be reached right now. Try again in a moment." Every line is the app's own copy for the error's code. The server's own wording never shows.

Each field keeps one line of room under it, so a field's error moves nothing. The forms use the sheets' spacing: fields 8 pixels apart below their lines, and the line for the server's refusal 8 pixels above the button. On a phone that line keeps no room, so the button sits 16 pixels under the last field's line, and a refusal moves the button down by its own height, 20 pixels for one line. The refusal and the button then scroll into view together, above the keyboard. From `md` the line keeps two lines of room, so the button never moves under the pointer. An invalid submit puts focus in the first field with a problem. A refusal from the server puts focus back in the field it names, else the first field, and the line above the button is announced.

While the device is offline, or the server cannot be reached, a line at the top of each page says "You are offline."

### On a phone

No field takes focus as a page opens, so the keyboard comes up only on a tap. Email fields bring up the email keyboard and do not capitalise. Fields are 48 pixels tall with 16 pixel text, so iOS never zooms. Password managers fill the fields, because each has a name and declares what it holds: the account field `username` on sign-in and sign-up, then `current-password` or `new-password`.

## How it works

### Route and entry

The pages are `/auth/sign-in`, `/auth/sign-up` and `/auth/forgot-password` under `apps/web/src/app/auth/(guest)/`, and `/auth/reset-password?token=` in `apps/web/src/app/auth/reset-password/`, outside the group. The group's layout reads on the server whether the backend offers Google, at request time, and passes it to the pages, so the button is right in the first paint. When the backend cannot be reached the pages render without Google.

`GuestGuard` wraps the three pages in the group. A visitor whose session is being restored sees a spinner. A signed-in visitor goes on to [the redirect target](../features/authentication.md#the-redirect-after-sign-in), which is a path on this site or the Day tab.

The reset page has no `GuestGuard`, so a link opened in a signed-in browser shows its form. It reads the session from the auth context only when it saves: a signed-out browser goes straight to `/auth/sign-in?reset=1`, and any other signs out to the same address first.

`AuthPage` also frames two pages the signed-in routes show in place of the tabs: "You are offline" on a device without a known session, and "Something went wrong" on a server fault. [The app shell](shell.md#when-the-server-is-at-fault) describes when each appears.

### Layout

`AuthPage` in `apps/web/src/components/auth/` draws the frame: the wordmark, the dashed rule, the page title in the display face and one column 26rem wide at most. The column is anchored to the top at every width, so the wordmark and the title sit at the same place on every guest page: under the status bar on a phone, 6rem from the top from `md` up. `Field` draws a labelled input with its hint or its error line, and `FormError` the line under a form, which is announced when it appears.

### Data and refresh

Sign-in and sign-up post to the app's own route handlers through the auth context. The reset request and the new password go straight to the backend, because neither carries a session. Every form checks its fields with the shared schemas from `packages/types` before it sends anything. A schema's error is a code, shown through the same copy as the server's.

## Features on this page

- [Authentication](../features/authentication.md): every rule these pages follow, from the password length to the rate limits and the Google flow.
- [Appearance](../features/appearance.md): the pages paint in the chosen theme.
