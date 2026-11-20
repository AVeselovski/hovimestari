# Connected AI

Connected AI is how a person gives their own AI assistant access to their Hovimestari data: a named connection key they make, hand to the assistant and revoke whenever they like. The app runs no model of its own and keeps no key to any AI service.

A signed-in person makes, lists and revokes keys in [Settings](../app/settings.md#connected-ai). An assistant connects with a key over the Model Context Protocol. It reads what the person's screens show: their targets, their days with both readings, their foods, favourites and recent items, and their saved meals. It can look up a barcode, and it reads the app rules, the text that tells it how to read every figure. With a key that can make changes, while the server allows them, it also logs, plans, changes, marks, copies, removes and restores the entries on the person's days, adds and edits the person's own foods and their portions, marks favourites, saves, edits and archives saved meals, and sets and removes targets. Every change it makes is recorded under the connection's name, and the person reads that record in Settings under Activity.

## In detail

### Connections and keys

A connection is one key given to one assistant. The person names it, such as "Claude on my laptop", in up to 64 characters. A name needs at least one character that shows. It may not hold control characters, line breaks inside it, characters that reverse the direction of text, zero-width spaces or soft hyphens. Joiners and flag characters are allowed, so Persian spelling, emoji joined into one picture and flags such as Scotland's all work. A name of only blank or filler characters is refused. The key is shown once, when it is made, and never again. The server keeps only a fingerprint of it, so nobody can read a key back from the app. A lost key cannot be recovered. The person revokes it and makes a new one.

A person holds at most 10 working keys at a time. A revoked key and an expired key do not count.

### Access and lifetime

A key can read, or read and make changes. Its access and its lifetime are set when it is made and never change. A key that reads lasts 7, 30 or 90 days, or a year. A key that can make changes lasts 7, 30 or 90 days. A day is 24 hours. A new key lasts 30 days and reads only, unless the person picks otherwise.

Listing the keys gives each one's name, its access, when it expires, when it was last used and how many changes its assistant made. Last use is recorded to the nearest five minutes. A key past its expiry stays listed as expired until the person removes it. A revoked key that made changes is listed apart, as a past connection, with its count and the time of its newest change, so its record stays readable. A revoked key that made no change is not listed at all.

### Showing a new key

A new key is shown once, on the device that made it, together with the steps that set an assistant up with it. It stays on screen until the person says they have copied it. Closing gestures leave it where it is, and leaving Settings and coming back shows it again. It lives only in the app's memory on that device: never in the browser's storage, the address, the app's cache of server answers or a log. It is gone once the person says they copied it, when the person signs out or their session ends, when another person signs in on the device, and when the app reloads. A revoke on another device does not reach the screen showing it: the key stops working, and it stays shown until the person says they copied it. A key lost before it was used is replaced by revoking its connection and making a new one.

Making the key does not change the list of connections behind it. The new connection joins the list once the person says they copied it. A read of the list while the key is shown, such as the one when the person comes back to the app, can already hold the new connection.

The setup steps cover Claude Code and Claude Desktop. Claude Code adds the server with one `claude mcp add` command that carries the key as a bearer header. Claude Desktop runs the `mcp-remote` bridge through `npx`, pinned to one version, because the bridge sees the key.

### Revoking a key

Revoking a key stops it at once. From that moment the server treats it as revoked, and it leaves the list. Removing an expired key revokes it the same way.

[Changing the password](authentication.md#sign-in-methods) or [resetting it](authentication.md#forgotten-password) revokes every key the person holds, together with ending every session. A change that fails revokes nothing. Signing out on all devices leaves keys alone.

Only a [session](authentication.md#staying-signed-in) that is still signed in can make a key. A device signed out by a password change, a reset or signing out on all devices cannot make one, even in the few minutes it can still reach the app. So no key outlives the password it was made under.

### What an assistant reads

An assistant connects to the app's endpoint with its key. It starts with one call, `get_context`, which answers what the key may do and when it expires, the person's today and time zone, the targets in force today with every change of targets, and the app rules.

Then it can read the rest, each from the same read the app's own screens use:

- `get_targets`: the targets in force on any date, with every change of targets.
- `get_day`: one day as the Day tab shows it, with its entries, its two readings and where each stands against the targets.
- `get_days`: up to 42 days side by side without their entries, or the Monday to Sunday week that holds a date, as the week sheet shows it.
- `search_foods` and `get_food`: the search the log sheet runs, and one food with its portions and the amount last eaten.
- `list_favourite_foods`, `list_own_foods` and `list_recent_items`: the favourites, the person's own foods, and what they logged lately with the amount of the last time.
- `list_saved_meals` and `get_saved_meal`: the saved meals, active or archived, and one of them.
- `look_up_barcode`: the [barcode lookup](foods.md#looking-up-a-barcode) the log sheet runs. It may call Open Food Facts, and it spends the person's own budget of lookups, shared with their own lookups in the app. A product it finds there is kept, and from then on it turns up in the person's food search. The answer says when this lookup did that. It changes none of the person's data.

Every day an assistant reads carries both readings, what was eaten and what the day comes to with the plan. A day before the first change of targets, or of a person with none, answers no targets and no positions, and its figures stand alone. No figure is filled in from a nearby change. A past day's reading with no entries answers no position and keeps its targets, as [where a day stands](days.md#where-a-day-stands) describes. The app rules tell the assistant that such a reading records nothing, so its zero is not what the person ate. A date may be `today`, which is the person's today in their time zone.

The assistant reads only the data of the person who made the key. Nothing it sends can name another person. Names of foods and meals come back as data, exactly as typed.

A call with an input the tool does not take is refused, and the refusal names the field and what is wrong with it, such as a date that does not exist or a range longer than 42 days. A refusal from the app itself, such as a food that is not there, gives the app's own message and its code.

### What an assistant can change

A key that can make changes, while the server allows them, also lists 18 tools that change the person's data. Each makes the same change the screen makes, through the same write, and the app refuses what the screen refuses.

For the entries on the person's days, as the Day tab and the log sheet change them:

- `log_food`: logs or plans a food on a day, by grams or by a count of one of its portions.
- `log_saved_meal`: logs or plans a saved meal, by its count of meals.
- `log_estimate`: logs or plans an estimate, a name and four typed figures. A meal judged from a photo or a description goes in this way, and it shows as an estimate.
- `update_entry`: changes, moves or marks one entry. A food's amount, a saved meal's count, and an estimate's name, figures and note can change. Its values per 100 g or per meal stay as they were when it was added.
- `set_entries_status`: marks up to 100 entries eaten or planned. Entries already in that status are left alone.
- `copy_entries`: copies up to 100 entries to another day. Every copy is planned, and the copies keep the order the entries have on their days.
- `remove_entries`: removes up to 100 entries. Each can be put back for ten minutes.
- `restore_entry`: puts back an entry removed in the last ten minutes, exactly as it was.

For [foods](foods.md#your-own-foods), as the log sheet and the Recipes tab change them:

- `create_own_food`: adds one of the person's own foods with its values per 100 g from a label, and a barcode if it has one. The answer holds the new food's id, so it can be logged at once.
- `update_own_food`: changes one of the person's own foods, given whole as the edit form saves it. A barcode left out is removed. Its planned entries from today on take the new values.
- `add_portion`: adds a portion of the person's own to any food they can see, such as a slice of a Fineli bread.
- `update_portion`: changes the name and grams of one of the person's own portions.
- `set_favourite`: marks a food the person can see as a favourite, or takes it off.

For [saved meals](saved-meals.md#a-saved-meal):

- `create_saved_meal`: saves a meal with its figures for one meal and an optional source.
- `update_saved_meal`: changes a saved meal, given whole as the edit form saves it. A source left out is removed. Its planned entries from today on take the new figures.
- `set_saved_meal_archived`: archives a saved meal or brings it back.

For [targets](targets.md#changing-your-targets):

- `set_targets`: sets the targets from a date, today when the date is left out, with the numbers the person gave. A change already on that date is replaced. The answer holds the change and the targets after it.
- `remove_targets`: removes the change that starts on a date. Its days fall to the change before it, or have no targets.

The app makes the id of every new entry and saved meal. Only the person's own foods can be edited. A Fineli food or a kept Open Food Facts product answers "Only your own foods can be changed." with `food_read_only`, as on screen.

Targets an assistant sets are the person's own numbers, set by their own assistant on their word. The app takes them as given and adds no view of its own. It refuses only what the screen refuses, such as a lower bound above the upper one.

Every answer says what happened. `created`, `changed` or `deleted` means the change was made and recorded. `unchanged` means nothing needed changing, such as marking entries already eaten, saving a meal as it already is or archiving one already archived, and nothing was recorded. `replayed` answers a retry, as [request keys](#request-keys) describe.

### What stays out of reach

An assistant cannot delete a food or a saved meal, and cannot remove a portion, because each is gone for good once removed. Those stay on screen. Removing entries from a day is in reach, because a removed entry can be put back. An assistant never reaches the person's account, settings, time zone, sign-in, other connections or the record of changes.

### The record of changes

Every change an assistant makes is recorded in the app, in the same step as the change itself, so a change is never made without its line in the record, nor a line written for a change that did not happen. A write the app refuses records nothing, and so does a write that changed nothing. A change made on screen is never recorded.

Each line holds the connection's name when the change was made, the time, what kind of change it was, the ids of what it made or changed, and what a person needs to read it. For entries that is each entry's name, date, status, kind, amount and figures. An amount in portions holds the portion's Fineli unit apart from its own name. For a food, a portion, a favourite or a saved meal it is the food's or the meal's name, with the values a new one was given and, for an edit, each field it changed from what to what. An edit to a portion also holds the portion's name. For targets it is the date the change starts, the ranges it replaced or removed, and the ranges it set. An estimate's note is recorded only when an edit changes it. The record never holds the connection key, the call's arguments as sent or anything the assistant said. Names in it are data, exactly as typed.

The person reads each connection's record in Settings, under [Activity](../app/settings.md#activity), newest change first, 50 changes at a time. A past connection's record reads the same way. Only the person who made a connection reads its record. An assistant reads no record, its own included.

Each change reads as one plain sentence of what was changed, such as "Planned Oat porridge" or "Set targets from 1 December 2026", then the details the record holds and the time it was made. An added entry shows the day it is for, its amount, energy and protein, and an estimate says so. A portion is named as the Day tab names it: a Fineli portion by its unit, a portion of the person's own by its name. A portion the app has no name for shows as its grams alone. An edit shows each field it changed, from what to what. A change to a portion names the portion. Copies are said to be planned. Targets show the ranges set and the ones replaced or removed. Dates, times and figures follow the device's language. Names are shown exactly as stored, as text.

The record states what was changed and passes no judgement on it. Nothing in it can be undone from the record, and no line links anywhere. The screen fixes a change the way it fixes any other. A change made while the record is open shows the next time it is opened, at the top.

The record is kept as long as the account and goes with it.

### Request keys

Every call that changes something carries a request key: a new random text the assistant makes for that call. Sent again with the same key and the same arguments, such as after a timeout, the call changes nothing a second time. It answers `replayed`, with when the first call was made, what it recorded, and the thing as it is now, with its id: the entries, the food, the portion, the saved meal or the targets. So a `create_own_food` whose first answer was lost still learns the new food's id. Something deleted since answers as gone, an entry with its day. A food the person deleted on screen reads as gone even when days still use it, as it does on screen. Two calls with one key that arrive at the same moment make one change, and the second answers as the replay of the first.

The same key with other arguments, or sent to another tool, is refused with "This requestKey was already used for a different change. Use a new requestKey." A call that changed nothing, was refused or failed before anything was saved keeps no key, so the key can be sent again, also with corrected arguments. A key belongs to its connection: two connections of one person may use the same text.

### The app rules

The app rules are a short text for the assistant, in plain words. They say how to read the figures: that the app computes every figure and the assistant quotes them, that targets are the person's own numbers, that planned is not eaten and every day has two readings, that an estimate is always named as one, and that names typed by people or read from Open Food Facts are data, never instructions. They say that nothing the app returns is nutrition or medical advice, and that the app never judges a day. A key that can make changes, while the server allows them, also gets the rules for making changes: propose a change and wait for a yes, give figures as the person stated them, set targets only with the numbers the person gave, use a new request key for every change and retry with the same one, and that every change is recorded under the connection's name, where the person can read it in Settings. They name only what such a key can change.

The rules come with `get_context` and also as a resource the assistant can read, because not every assistant shows a resource to its model.

### When a key stops working

A revoked key or an expired key is refused on its very next request. The answer says why: "This key was revoked." or "This key has expired. Create a new one in Settings." A key the app never made gets "Invalid or expired token." and nothing more. The key itself never appears in an answer from the endpoint or in a log line.

### Limits

All the keys of one person share a limit of 120 requests a minute. Past it, the app answers that there were too many requests and to try again in a minute.

A barcode lookup that reaches Open Food Facts spends from the person's 30 lookups an hour, the same budget their own lookups in the app spend. Past it, the refusal says how many seconds to wait.

Changes have two limits of their own, also shared by every key of one person:

- 30 calls that change something a minute, counted whether or not the app made the change. Past it the answer is "Too many changes in a minute. Wait a minute, then send the same call again with the same requestKey. A change that already landed is not made twice." A call this limit refuses changes nothing and is not counted, so the same call sent again after the wait makes its change once.
- 300 recorded changes in the last hour. A change to a batch of entries counts as one. Past it the answer is "This account has had 300 changes by assistants in the last hour. Make the rest in the app, or wait." A retry of a change that already landed still answers as its replay.

Both come back as a refusal the assistant reads, never as an HTTP 429.

Requests with a key the app refuses are limited per computer, so nobody can guess keys at speed. A computer that keeps sending an old revoked key does not lock out a new key used from the same computer.

The endpoint takes no request from a web page. Any request that names a web page as its origin is refused.

The limit of 300 changes an hour is counted from the record of changes, so it holds across a restart and would hold across several backend machines. Every other limit here is kept in the memory of the backend machine, so a restart starts it afresh, and a second machine would keep its own count and let through as much again.

### Switched off on the server

Whoever runs the server can switch connected AI off, or switch off only keys that make changes. Keys that make changes are off unless the server switches them on. While connected AI is off no key can be made, and the endpoint is not there, so no key works. While changes are off a key that reads can still be made, and a key that makes changes cannot. A key that makes changes made earlier then reads only, and lists no tool that changes anything. A key that reads never lists one, whatever the server allows. Listing the keys also says which of the two the server offers.

## How it works

### Keys

`apps/backend/src/lib/connectionKeys.ts` makes and looks up keys. A key is `hovi_mcp_` followed by 32 random bytes in base64url, 52 characters and 256 bits of entropy. Only its SHA-256 hex is stored, the scheme refresh tokens use. A fast unsalted hash suits a random 256-bit secret, which has no dictionary to attack. A key is looked up by the hash of the key presented, so no timing difference can lead to a matching key.

`lookupConnectionKey(key)` answers one of four states, in one query joined to the key's user:

- `active`, with the connection's id, its user, its name, its access, its expiry and the user's time zone.
- `revoked`. A key both revoked and expired is revoked.
- `expired`, judged by the database clock.
- `unknown`, for anything the server never issued, a text without the `hovi_mcp_` prefix, and a key whose account was deleted.

An `active` lookup also carries `touchDue`, worked out in the same query: the key was never used, or last used more than five minutes ago. `touchLastUsed(id)` records a use with one conditional update, and the endpoint calls it only when `touchDue` holds. The update repeats the five-minute condition, so two requests that both saw a use due write once. It matches no revoked key, so a revoke between the lookup and the write records no use. A failed write is logged with the connection's id and never fails the call.

The key appears in the answer that creates it and nowhere else: in no other answer, no error and no log line. That answer carries `Cache-Control: no-store`, so no browser or proxy keeps it.

### Making and revoking

`apps/backend/src/services/writes/connections.ts` holds the writes. `createConnection` checks the switches, then locks the user's row `FOR NO KEY UPDATE`, checks the session, counts the live keys and inserts the new one, in one transaction. Two creates at once by one person therefore run one after the other, and the second counts the first one's key, so the limit of 10 holds. Expiry is set on the database clock, as `now()` plus the chosen days of 24 hours each, and every check of it reads the same clock.

The access token names its session's family, as [the tokens](authentication.md#tokens) describe. Under the user lock the create requires an unexpired refresh row of that family. Without one it answers 401 `session_expired`, and the web app renews the session or signs the person in again. Every way a session ends takes the same lock, so none can land between the check and the insert. An access token that names no family is refused the same way.

`revokeConnection` stamps `revoked_at` on one key of the user that is not yet revoked. A row is never deleted while its user lives. `revokeAllConnections` stamps every key of a user. The password change and the password reset call it inside their own transactions, beside `endAllSessions`, which ends every session.

`apps/backend/src/services/reads/connections.ts` lists the keys not revoked, newest first, and works out each one's status on the database clock.

### The endpoint

`POST /mcp` on the backend serves the Model Context Protocol over Streamable HTTP, stateless: every request builds a fresh server for the key it carries, so a revoked or expired key fails on its next request. `GET` and `DELETE` answer 405 with a JSON-RPC error and no `Allow` header. `apps/backend/src/app.ts` mounts it after the request log and before CORS and the JSON parser, so it sends no CORS headers and parses its own body. It is mounted only while `MCP_ENABLED` is on. Off, the path answers 404.

The four `@modelcontextprotocol` packages are pinned to exact versions in `apps/backend/package.json`: `server` 2.3.1, `express` 2.0.2, `node` 2.1.1, and `client` 2.3.1 for the tests. They serve the 2025 protocol revisions and 2026-07-28.

- A 2025 request sends `Accept: application/json, text/event-stream` and is answered as one server-sent event. It may start with `initialize`, and it needs no other header. A request that accepts only JSON is refused 406.
- A 2026-07-28 request is answered as plain JSON. It carries the headers `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method` naming the method, and on `tools/call` also `Mcp-Name` naming the tool. Its `params._meta` holds `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities`. A request missing any of them is refused 400.

`apps/backend/src/mcp/router.ts` runs every request through these steps, in order:

1. Any `Origin` header answers 403 `forbidden`. Every request from a web page is refused, which also shuts out DNS rebinding.
2. The address limit: 300 refused requests in 15 minutes from one address, then 429 for every key from it.
3. The dead-key limit: 300 requests with one revoked or expired key in 15 minutes from one address, then 429 "This key no longer works. Create a new one in Settings."
4. The JSON parser, with a 100 kB limit. A larger body answers 413 and one that does not parse answers JSON-RPC error `-32700`. Nothing of the body is logged.
5. The key limit: 30 refused requests in 15 minutes per address and key prefix, then 429.
6. The key check, `requireConnectionKey` in `mcp/auth.ts`. A refused key answers 401 `invalid_token` with the reason in `error_description` and in the `WWW-Authenticate` challenge. A lookup that fails, such as on a database timeout, answers 500 `server_error`. It counts toward no limit.
7. The request limit: 120 requests a minute per user, shared by every key the user holds, then 429 with `RateLimit-*` and `Retry-After` headers.
8. The record of last use, through `touchLastUsed`, only when the lookup says one is due. A failure is logged and the request goes on.
9. The protocol handler.

Steps 2, 3 and 5 run before the user is known, so they count per address, and steps 3 and 5 per address and the first 13 characters of the key presented. That prefix is 24 random bits, no secret, and lives only in the limiters' memory. Only a refused key counts toward steps 2 and 5. A known revoked or expired key counts toward step 3 instead, so a stale client is not taken for a guesser. All four limits live in process memory, as do the barcode lookup's budgets. The backend runs on one machine. A second machine would keep its own count, and give every budget twice. The address is `Fly-Client-IP` in production, else the socket's.

### From key to service context

`verifyConnectionKey` in `mcp/auth.ts` looks the key up and turns a live one into the protocol's auth info. Its `extra` carries `connectionId`, `connectionName`, `userId`, `access`, `expiresAt` and `timeZone`. Its scopes are `data:read`, plus `data:write` for a key that can make changes.

`mcp/server.ts` builds the server for each request. Every tool call builds its context with `contextForUser`, the function every REST route's context comes from, so a tool gets the same user, clock, time zone and today a route gets. No tool input names a user.

### Tools

`mcp/result.ts` defines a tool with `defineTool` and runs it with `runTool`. Every answer is one text block of compact JSON: `{ today, timeZone, units, data }`, where `data` is the service's answer with its fields named as the REST answer names them. A tool selects fields and computes nothing. A refusal from a service comes back as an error result, its message followed by its code, and for a limit the seconds to wait, such as `(barcode_lookup_limit, retryAfterSeconds: 120)`. A tool never answers with an HTTP 429. An input a tool's schema refuses comes back as an error result too, which reads `Input validation error: Invalid arguments for tool <name>: <field>: <issue>`, such as `from: invalid_date`. Anything unexpected is logged and answered with a general error. A name a person typed is a string in that JSON and nothing else.

The read tools, which every key lists, are `READ_TOOLS` in `mcp/tools/index.ts`, defined in `tools/context.ts`, `tools/days.ts`, `tools/foods.ts` and `tools/meals.ts`. Every read tool is marked read-only and idempotent and takes no user id. For `look_up_barcode`, read-only means it changes none of the person's data: it can keep a product and make it findable in their search. Every read tool but `look_up_barcode` is also marked as reaching nothing outside the app. Each input is a strict object, built from the query schema its route parses, so a field a tool does not take is refused.

| Tool                   | Service and route                                             | Input                                                                  | Answers                                                                                               |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `get_context`          | `targetsOverview`, `GET /targets`                             | none                                                                   | `access` (`canWrite`, `expiresAt`), `today`, `timeZone`, `targets` (`inForce`, `changes`) and `rules` |
| `get_targets`          | `targetsOverview`, `GET /targets`                             | `date`, a date or `today`, today when left out                         | `{ date, today, inForce, changes }`                                                                   |
| `get_day`              | `getDay`, `GET /days/:date`                                   | `date`, a date or `today`                                              | the day, field for field                                                                              |
| `get_days`             | `listDaySummaries`, `GET /days`                               | `from` and `to`, at most 42 days, or `weekOf` alone, a date or `today` | `{ days }`                                                                                            |
| `search_foods`         | `searchFoods`, `GET /foods/search`                            | `q`, 1 to 100 characters, and `limit`, 1 to 50, 30 by default          | `{ foods }`                                                                                           |
| `get_food`             | `getFood`, `GET /foods/:id`                                   | `foodId`                                                               | the food, its portions and `lastAmount`. A food the person cannot see answers `food_not_found`        |
| `list_favourite_foods` | `listFavouriteFoods`, `GET /foods/favourites`                 | `limit`, 1 to 200, 100 by default                                      | `{ foods }`, each with `lastAmount`                                                                   |
| `list_own_foods`       | `listOwnFoods`, `GET /foods/own`                              | `limit`, 1 to 200, 100 by default                                      | `{ foods }`                                                                                           |
| `list_recent_items`    | `listRecents`, `GET /log/recents`                             | `limit`, 1 to 30, 12 by default                                        | `{ items }`                                                                                           |
| `list_saved_meals`     | `listSavedMeals`, `GET /saved-meals`                          | `archived`, `true` or `false`, `false` by default                      | `{ meals }`                                                                                           |
| `get_saved_meal`       | `getSavedMeal`, `GET /saved-meals/:id`                        | `savedMealId`                                                          | the meal, archived or not. Another person's answers `saved_meal_not_found`                            |
| `look_up_barcode`      | `lookupBarcode` with the shared budgets, `POST /foods/lookup` | `barcode`, 8 to 14 digits, spaces dropped                              | `found` with `food` and `newlyVisible`, `incomplete`, `not_found` or `in_store`, as the route answers |

`get_targets` and `get_context` leave out the route's `firstRunDue`, which only routes a screen. `get_days` reads a `weekOf` date's week through `weekOf` in `packages/types/src/dates.ts`, the function the web's week sheet uses, so an assistant never works out Monday itself. `list_saved_meals` takes `archived` as a boolean, where the route's query takes the text `true` or `false`.

The app rules are also the resource `hovimestari://app-rules`, as `text/markdown`.

`apps/backend/src/mcp/__tests__/importBoundary.test.ts` pins what the tools can reach. No file under `src/mcp/` imports a route, middleware, the database module, `drizzle-orm` or a database driver, so every query stays in the services. No file there reaches the database client a context carries, builds SQL or loads a module by a computed path or through `createRequire`. Of the backend's `lib/` modules, a file there imports only the ones on an allow-list in the test, and none of them makes a session. Only files under `tools/writes/`, and `tools/foods.ts` for the barcode lookup, may import a write service. A file under `tools/writes/` imports only the recorded writes in `services/writes/recorded/` and the record in `services/writes/changeRecord.ts`, so no change is made without its record. Only `tools/writes/run.ts` imports the record, for the replay, the hash and the hourly count, and no file under `src/mcp/` names `recordedWrite`. No file outside `tools/writes/` but `mcp/server.ts` imports from it, so the read tools and their registry never hold a write tool. No file there names `deleteOwnFood`, `deleteSavedMeal`, `removePortion`, `removeEntry` or `approveDeletion`. No file there imports the connection services or the record's read service, so no tool lists keys or reads a record.

### Write tools

The write tools are `WRITE_TOOLS` in `mcp/tools/writes/index.ts`, defined with `defineWriteTool` in `tools/writes/entries.ts`, `foods.ts`, `meals.ts` and `targets.ts`. `mcp/server.ts` registers them after the read tools only when the key can write and `MCP_WRITES_ENABLED` is on, never on the key's scope alone. Each is marked as a change, idempotent through its request key and reaching nothing outside the app. `update_entry`, `set_entries_status`, `remove_entries`, `update_own_food`, `update_portion`, `update_saved_meal`, `set_saved_meal_archived`, `set_targets` and `remove_targets` are marked destructive, the others only add. Each input is `writeInput` in `mcp/inputs.ts`: a strict object built from the pieces of the body schema its route parses, plus `requestKey`, 8 to 64 letters, digits, `-` or `_`. `EntryIdSet` there is the list of entry ids `copy_entries` and `remove_entries` take, which refuses a repeated id with "Give each entry id once."

A tool takes its input, calls one function in `apps/backend/src/services/writes/recorded/` and selects fields from its answer. `runWriteTool` hands the tool its arguments without the request key, which only it reads. `runWriteTool` in `tools/writes/run.ts` runs every call in this order:

1. The per-minute limit, in memory, keyed by the key's user (`mcp/writeBrake.ts`). A call the SDK refuses at input validation never reaches it, so it does not count.
2. The actor: the connection's id and name, the request key, and the request hash, the SHA-256 of the tool's name and the call's other arguments as canonical JSON. `entryIds` hash as a set, sorted, lower-cased and without repeats. A date hashes as sent, so a retry the next day with `today` and the same key replays the first change.
3. `findReplay`: the record row of this connection and request key. The same hash answers the replay. Another hash is refused 409 `request_key_reused`.
4. The hourly limit, only when there is no replay: `countRecentChanges` counts the user's rows of the last hour on the index `assistant_changes_user_idx`. It reads before the write's transaction, so calls in flight together can each pass at 299 and land past 300. The per-minute limit bounds that to one minute's calls.
5. The recorded write.
6. The answer: the outcome from the record, the fields the tool selected, and a note. A replay answers `firstCallAt`, `recorded` (the row's summary) and the thing as it is now, read by the row's ids through read services. `goneAsNull` in `changeRecord.ts` turns a read's own not-found refusal into null, and lets every other failure through.

A refusal comes back as an error result with its message and code. Anything unexpected is logged and answered "Something went wrong. Send the same call again with the same requestKey. If the change was saved, the app returns it and saves nothing twice."

### Recording a change

`recordedWrite(ctx, via, w)` in `apps/backend/src/services/writes/changeRecord.ts` is the one place a change and its record meet. It opens one transaction, takes the user's row first, `FOR KEY SHARE` as every entry write does, runs the write's before-read, runs the screen's write service on the transaction, and inserts the record row last. Each service opens its own transaction, which runs as a savepoint inside this one, so no service knows it is recorded. The connection reaches `recordedWrite` as a parameter, and the service context keeps its shape.

`set_targets` takes the user's row `FOR UPDATE` instead, and reads the change it replaces and writes under that one lock. A targets change on a date with none yet has no row to lock, and the screen's save takes the user's row only `FOR KEY SHARE`, so this is the lock that makes a screen save on any date wait, and the record's before is exactly what the assistant replaced. `remove_targets` takes the user's row `FOR NO KEY UPDATE`, the lock its service takes first, then the change's own row. No lock is ever upgraded, so two targets writes at once queue and never deadlock.

Each function in `services/writes/recorded/` calls exactly one write service, and nothing there writes a row of its own. `services/writes/recorded/__tests__/screenPath.test.ts` reads their source and pins both. A file there imports every module by name, never as a namespace or at run time, so the count sees every write service it reaches. A function's before-read locks the entries it may change `FOR NO KEY UPDATE`, in id order as the batch writes lock them: `update_entry` reads the entry it compares, and `remove_entries` the entries the record names, which are gone after the write. `update_own_food` and `update_portion` lock the own food or portion `FOR NO KEY UPDATE`, and `update_saved_meal` and `set_saved_meal_archived` lock the meal `FOR UPDATE`, as the meal's own service does. `fieldChanges` in `changeRecord.ts` lists each field whose value changed.

The outcome follows the record. When the write changed nothing, the function answers no record, and `recordedWrite` answers `unchanged` whatever the service said. That covers an edit to the same values, a status already set, entries already gone, an entry already restored, a favourite already set, a meal already archived and the same targets saved again.

Two calls with one key at once both start. A call that only adds makes its change, and its record insert waits on the unique index `assistant_changes_request_key_uq`, then fails once the first commits. Its whole transaction rolls back with its change. A call that changes what is there, such as an edit, a mark, a removal or a restore, waits on the first call's row locks instead, then finds nothing left to change. Before it answers `unchanged`, `recordedWrite` looks for a record row with this connection and request key, and the first call's row is there to read. Either way `recordedWrite` throws `RequestKeyTaken`, and `runWriteTool` answers it from the first call's row through `replayAfterConflict`.

### Reading the record

`listChanges(ctx, connectionId, { cursor, limit })` in `apps/backend/src/services/reads/changeRecord.ts` reads one connection's record. It first checks that the connection is the person's own, revoked or not, and answers 404 `connection_not_found` for any other id, another person's included. A page is `limit` changes, 50 unless the request names 1 to 100, ordered by `created_at` and then `id`, newest first.

The cursor names the last change of the page before. It is that change's id as 22 characters of base64url, and holds nothing else. The next page holds the changes older than it by `(created_at, id)`, compared in the database at full precision, so changes that share one moment page by id and none is answered twice or skipped. A change made after the first page was read is newer than every cursor, so it shows only on a fresh first page. `listChanges` reads the cursor's change back from this connection's record and refuses a cursor that names none with 400 `invalid_request`, as it refuses text that no cursor encodes. `nextCursor` is null on the last page.

A change in a page holds `id`, `action`, `at`, `connectionName`, `summary` and `deletionStatus`, which is null for every action today. The ids it touched, its request key and its hash stay in the backend.

`changeCount(ctx, connectionIds)` in `services/reads/connections.ts` counts the changes of many connections in one grouped query. It reaches them through the person's own connections, so a count is an index-only scan of `assistant_changes_connection_idx` and another person's connection counts nothing. `listPastConnections(ctx)` is one query too: each revoked connection of the person's with its count and newest change, from the same index, newest change first.

### The app rules text

`apps/backend/src/mcp/appRules.ts` holds the text: `APP_RULES` for every key and `WRITE_RULES` added for a key that can make changes while the server allows them. Each section names the feature docs it is written from in a `*(Sources: …)*` line. `APP_RULES_SOURCES` stamps every doc in `docs/features/` with its SHA-256 at the last review. `apps/backend/src/mcp/__tests__/appRules.test.ts` fails when a feature doc changes, naming the doc and printing its new hash, so a change to a feature re-reads the rules that rest on it. The test also keeps advice words out of the text, bounds its length and checks that every feature doc is named.

### The smoke check

`pnpm --filter @hovimestari/backend mcp:smoke` runs `apps/backend/src/scripts/mcpSmoke/` against a local, migrated database made for it, the one `DATABASE_URL` names. It refuses any host but `localhost`, `127.0.0.1` or `::1`, a URL with query parameters, a database name with anything but letters, digits, `_`, `-` and `.`, and a database whose name does not end in `_smoke`. A test runs the refused and accepted addresses through pg's own parser too, and fails if pg would read an accepted one as another host, port or database. `MCP_SMOKE_ANY_DATABASE=true` lifts the name rule for one run: the script prints the host and the database it is about to write to, and refuses unless `MCP_SMOKE_CONFIRM_DATABASE` repeats that database name exactly. It starts the app inside its own process on a free local port, signs up a user of its own with a password it makes, and gives it a day of data through the REST routes. Then it makes a read key and a writing key, calls every read tool with the real client and compares each answer with the REST route the screen reads. Its write leg logs one food through `log_food` and the same body through `POST /entries`, compares the two, checks one record row for the tool's change and none for the screen's, and checks that a retry replays. It then makes a food through `create_own_food`, compares it with `GET /foods/:id`, logs it through `log_food` and checks the two record rows. It reads the three changes back through `GET /connections/:id/changes`, two a page, and the writing key's count through `GET /connections`. At the end it revokes both keys, checks that a call is refused, and deletes its user, which takes every row it made. It makes every secret it lacks at start-up and points barcode lookups at a closed local port, so it reaches nothing outside the machine. CI runs it after the tests, on a database of its own.

### Logs

The request log has one line per request, such as `[req] POST /mcp 200 14ms`. Each tool call adds `mcp tool=<name> conn=<connection id> ms=<n> <outcome>`, where the outcome is `ok`, `replayed`, `unchanged`, `refused` or `error`. A call whose input the schema refuses logs its line as `refused` too. No line holds a key, an argument, a request key, a name or a figure. An unexpected error logs its stack and database error code. A failed key lookup logs them under `[mcp] key lookup failed`.

### The two switches

Two env values on the backend, read when it starts:

- `MCP_ENABLED`: connected AI is on, and `/mcp` is mounted. `true` by default.
- `MCP_WRITES_ENABLED`: keys that make changes are on. `false` by default. It has effect only while `MCP_ENABLED` is on too. On, a key that can make changes lists the write tools and gets the rules for making changes. Off, it reads only: it lists no write tool, its server instructions say changes are switched off, and it gets the app rules without the rules for making changes.

Each takes `true` or `false`. Unset or empty takes the default, and any other value stops the server at start-up. A change takes a restart. Every list and every create reads the values the server holds at that moment.

### API

All under `/api/v1`, with a signed-in user's access token. A connection key presented to any of these routes, or to any other route under `/api/v1`, answers 401 `unauthorized`, so a key can never make, list or revoke keys, nor read a record.

| Method | Path                                      | Answers                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/connections`                            | 200 `{ connections, past, availability }`. Each connection carries `changeCount`. `past` holds the revoked connections that made changes, newest change first. `availability` is `{ connect, write }`: `connect` is `MCP_ENABLED`, `write` is both switches on                                                                                                                      |
| POST   | `/connections`                            | 201 `{ connection, key }` with `Cache-Control: no-store`. 400 `invalid_request`, `connection_name_required`, `connection_name_too_long`, `connection_name_invalid`, `connection_expiry_invalid`, `connection_write_expiry_too_long` or `writes_off`. 401 `session_expired` when the access token's session has ended. 404 `user_not_found`. 409 `connection_limit` or `connect_off` |
| DELETE | `/connections/:id`                        | 204 for a key of the user's not yet revoked, active or expired. 404 `connection_not_found` for a revoked key, another user's, a missing one or an id that is not a UUID                                                                                                                                                                                                             |
| GET    | `/connections/:id/changes?cursor=&limit=` | 200 `{ changes, nextCursor }`, newest first, as [reading the record](#reading-the-record) describes. `limit` is 1 to 100, 50 by default. 400 `invalid_request` for another `limit` or a cursor the route did not issue. 404 `connection_not_found` for another user's connection, a missing one or an id that is not a UUID. A revoked connection of the user's answers 200         |

The body of a create is `{ name, access, expiresInDays }`. `access` is `read` or `read_write`, `read` by default. `expiresInDays` is 7, 30, 90 or 365, 30 by default. A connection in an answer is `{ id, name, access, status, createdAt, expiresAt, lastUsedAt }`, with `status` `active` or `expired`. A listed connection adds `changeCount`. A past connection is `{ id, name, changeCount, lastChangeAt }`. The shapes are the Zod schemas in `packages/types/src/connections.ts`, and a page of changes is `AssistantChangePageSchema` in `packages/types/src/assistantChanges.ts`.

### Data

`assistant_connections`, in `apps/backend/src/db/schema/assistantConnections.ts`:

- `user_id`: the key's user, with `ON DELETE CASCADE`.
- `name`: 1 to 64 characters, by the CHECK `assistant_connections_name_len`.
- `key_hash`: the SHA-256 hex of the key, unique.
- `access`: `read` or `read_write`, by the CHECK `assistant_connections_access`.
- `expires_at`: always set. There is no key that never expires.
- `last_used_at`: null until the first use.
- `revoked_at`: null while the key is not revoked.
- `created_at`: when it was made. The index `assistant_connections_user_idx` reads a user's keys newest first.

`assistant_changes`, in `apps/backend/src/db/schema/assistantChanges.ts`, one row per recorded change:

- `user_id`: the person, with `ON DELETE CASCADE`.
- `connection_id`: the connection that made the change, with `ON DELETE CASCADE`. A connection row is never deleted while its user lives, so its record stays after a revoke.
- `connection_name`: the connection's name when the change was made.
- `action`: the kind of change, by the CHECK `assistant_changes_action`: `entry.added`, `entry.changed`, `entries.marked`, `entries.copied`, `entries.removed`, `entry.restored`, `food.created`, `food.changed`, `portion.added`, `portion.changed`, `favourite.set`, `favourite.unset`, `saved_meal.created`, `saved_meal.changed`, `saved_meal.archived`, `saved_meal.restored`, `targets.set` and `targets.removed`. The CHECK also names `deletion.requested`, which no tool makes yet.
- `entity_ids`: the ids of what the change made or changed, at least one by the CHECK `assistant_changes_entity_ids`: the new or changed entry, the ones a batch changed or removed, or the copies in their order. A food's id, then a portion's for a portion. A saved meal's id. A targets change's row id, which the API never shows. It has no foreign key, since a row may be gone since.
- `summary`: what a person reads, as `AssistantChangeSummarySchema` in `packages/types/src/assistantChanges.ts` shapes it.
- `request_key` and `request_hash`: the call's key and the hash of its arguments. The unique index `assistant_changes_request_key_uq` is on the connection and the key.
- `created_at`: the moment of the insert, `clock_timestamp()`, so the order of changes is kept. The index `assistant_changes_connection_idx` reads one connection's record newest first and serves its count, and `assistant_changes_user_idx` counts the person's last hour.

### Known gaps

- An assistant has no way to ask for a deletion. What it cannot delete is in [what stays out of reach](#what-stays-out-of-reach).

Requirements: FR-AI-01 to FR-AI-08, FR-AI-10 to FR-AI-16, NFR-SEC-02, NFR-SEC-04 (requirements 3.10 and 4)

## Where it appears

- [Settings](../app/settings.md#connected-ai): the Connected AI panel lists, makes and revokes keys, shows a new key once, and shows each connection's record under Activity. Changing the password there revokes every key.
- [Sign-in and account pages](../app/auth.md): choosing a new password from a reset link revokes every key.
