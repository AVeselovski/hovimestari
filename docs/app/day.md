# Day

The first tab, at `/`. It holds the way into the foods.

## In detail

### Search foods

At the top, a full-width button drawn like a search field, with the search icon and "Search foods". It opens [the food sheet](food-sheet.md). Under it the tab says "Nothing here yet.".

## How it works

### Route and entry

`apps/web/src/app/(app)/page.tsx`, behind the shell and [the first-run gate](../features/targets.md#the-first-run-gate). The button is `FoodSearchLauncher` in `apps/web/src/components/foods/`, which owns the food sheet and keeps it mounted while it slides out.

### Layout

The shell's one column. The button is 48 pixels tall, the height of a field, so it reads as one.

### Data and refresh

The tab reads nothing itself. The food sheet makes its own reads.

## Features on this page

- [Foods](../features/foods.md): the food sheet the button opens.
