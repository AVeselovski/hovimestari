---
name: review-feedback
description: Digests code review feedback and produces a clear, actionable list of changes to be made. Use when the user provides code review feedback.
---

Evaluate the code review feedback provided by the reviewer. Do not blindly jump into planning and implementing the fixes. Based on the original task requirements, project requirements, context, and future plans, evaluate which issues are valid and need to be addressed, which should be deferred, and which are non-issues. Some feedback may be valid in isolation, but lack context of prior decisions.

For each item, decide one of:

- **Fix now.** Valid, in scope for this change, and cheap enough to land on the same branch.
- **Defer.** Valid but out of scope. Add it to `TODO.md` with what it is, why it is open and who decides, so it is not lost in chat.
- **Answer.** Not an issue once the context is known (a prior decision, a stated constraint, a requirement). Reply on the review with that context instead of changing code.

Then produce the list of changes to make, grouped by file or concern, and the replies to post. Do not start implementing until the list is agreed or the task already authorises it.
