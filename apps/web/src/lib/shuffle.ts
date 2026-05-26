import type { Recipe } from "@hovi/shared";

export function shuffle(recipes: Recipe[], n: 2 | 3): string[] {
  const pool = recipes.filter((r) => r.category === "common");
  if (pool.length === 0) return [];

  const ranked = [...pool].sort((a, b) => {
    const ta = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const tb = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    return ta - tb;
  });

  const candidateSize = Math.min(Math.max(5, n * 2), ranked.length);
  const candidates = ranked.slice(0, candidateSize);

  // Fisher-Yates partial shuffle.
  const arr = [...candidates];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length)).map((r) => r.id);
}
