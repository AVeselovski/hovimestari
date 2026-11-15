# Link map

Every concept's home: the heading in the doc that owns it. The first mention of a concept in a human-facing doc links here. An agent that adds a home heading adds its row to this table in the same change, and one that renames a heading repoints every link to it in that change.

Paths are relative to `docs/`. The **Heading** column is the exact heading text, so the anchor resolves. "Doc" means link the doc itself, with no anchor.

Group rows by area, one `##` heading per area, in the same order as the feature catalog.

## Example area

| Concept                      | Home                                             | Heading                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------- |
| example concept, its synonym | `_templates/feature.md#mechanism-in-plain-words` | `### Mechanism, in plain words` |
