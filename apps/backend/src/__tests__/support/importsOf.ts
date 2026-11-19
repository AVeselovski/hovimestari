/**
 * Every module path a source file imports: static `from` imports and
 * re-exports, side-effect imports (`import "x"`) and dynamic `import("x")`,
 * with the path in single, double or back quotes. The import-boundary tests read source text with it.
 */
export function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}
