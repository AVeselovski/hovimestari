"use client";

import { useOptionalAuth } from "@/contexts/AuthContext";
import { meQuery } from "@/lib/queryOptions";
import type { FoodNameLanguage, FoodSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// The language a food's two names are in, for their `lang` attribute, so a
// browser hyphenates a long name by the right rules. The name is in the
// user's food-name language, and the other name in the other one. A Fineli
// food with no English name shows its Finnish name in English too, and then
// has no other name.
// ---------------------------------------------------------------------------

export interface FoodNameLangs {
  name: FoodNameLanguage | undefined;
  other: FoodNameLanguage | undefined;
}

const otherOf = (lang: FoodNameLanguage): FoodNameLanguage => (lang === "fi" ? "en" : "fi");

/** The `lang` of a food's name and of its other name, from the account's food-name language. */
export function foodNameLangs(food: FoodSummary, language: FoodNameLanguage | null): FoodNameLangs {
  if (language === null) return { name: undefined, other: undefined };
  const name = language === "en" && food.source === "fineli" && food.otherName === null ? "fi" : language;
  return { name, other: otherOf(name) };
}

/** The account's food-name language, as last answered, or null before the account is known. */
export function useFoodNameLanguage(): FoodNameLanguage | null {
  const auth = useOptionalAuth();
  // Read from the cache only: a language change puts the answered account
  // there (afterFoodNameLanguageChange). This part never asks for it.
  const { data: me } = useQuery({ ...meQuery(), enabled: false });
  return (me ?? auth?.user)?.foodNameLanguage ?? null;
}
