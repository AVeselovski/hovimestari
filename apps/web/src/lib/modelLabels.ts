const ANTHROPIC_MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export function formatImportSource(provider: string, model: string): string {
  if (provider === "anthropic") {
    const pretty = ANTHROPIC_MODEL_LABELS[model];
    if (pretty !== undefined) {
      return `Luotu Anthropic ${pretty} -mallilla`;
    }
    return `Luotu Anthropic-mallilla (${model})`;
  }
  return `Luotu paikallisella mallilla (${model})`;
}
