const ANTHROPIC_MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

function providerLabel(provider: string, model: string): string {
  if (provider === "anthropic") {
    const pretty = ANTHROPIC_MODEL_LABELS[model];
    return pretty !== undefined
      ? `Anthropic ${pretty} -mallilla`
      : `Anthropic-mallilla (${model})`;
  }
  return `paikallisella mallilla (${model})`;
}

export function formatImportSource(
  provider: string,
  model: string,
  confidence?: number,
  fallback?: { provider: string; model: string; confidence: number },
): string {
  const pct = (c: number): string => `${Math.round(c * 100)} %`;

  if (fallback !== undefined && confidence !== undefined) {
    // Local tried first, had low confidence, winning provider used as fallback
    return (
      `Paikallisen mallin luottamus liian matala (${pct(fallback.confidence)}), ` +
      `luotu ${providerLabel(provider, model)} (${pct(confidence)})`
    );
  }

  const confidenceSuffix =
    confidence !== undefined ? ` (${pct(confidence)})` : "";
  return `Luotu ${providerLabel(provider, model)}${confidenceSuffix}`;
}
