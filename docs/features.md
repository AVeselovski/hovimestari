# Feature catalog

Every feature Hovimestari has, one or two sentences each, with a link to its detail doc. Anything not listed here is not built. What is planned is in [the requirements](requirements.md#mvp-scope-and-later), and the product framing is in the [overview](overview.md).

Feature docs and page docs are two different axes. A feature doc says what a feature is and how it works. A page doc says what a page is for, what it shows and which features it composes. A page composes several features, and a feature appears on several pages. A new feature starts from [the feature template](_templates/feature.md) and a new page from [the page template](_templates/page.md).

## Accounts

- [Authentication](features/authentication.md): signing up and in with a password or Google, staying signed in, recovering a forgotten password, choosing how to sign in, and deleting the account with everything in it. No browser JavaScript ever holds a refresh token.
