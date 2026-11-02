/** Parsers for the /alusta answers, and the download offer used by the plan.
 * The recommendation itself comes from the fact sheet in assistant-plans. */
export const USES = ["claude", "chatgpt", "grok", "other", "none"] as const;
export type Uses = (typeof USES)[number];
export const BUSINESSES = ["yes", "no", "unsure"] as const;
export type Business = (typeof BUSINESSES)[number];
export type AssistantId = "claude" | "chatgpt" | "grok";

/** Grok Bot has no verified download page, so it is absent here. */
export const ASSISTANT_DOWNLOAD: Record<"claude" | "chatgpt", string> = {
  claude: "https://claude.ai/download",
  chatgpt: "https://chatgpt.com/download",
};

export const TIERS = ["free", "paid", "unsure"] as const;
export type Tier = (typeof TIERS)[number];

export function parseUses(v: unknown): Uses | null {
  return v === "claude" || v === "chatgpt" || v === "grok" || v === "other" || v === "none" ? v : null;
}
export function parseBusiness(v: unknown): Business | null {
  return v === "yes" || v === "no" || v === "unsure" ? v : null;
}
export function parseTier(v: unknown): Tier | null {
  return v === "free" || v === "paid" || v === "unsure" ? v : null;
}

/** Download page only when the recommended assistant is not the one they already use. */
export function offerDownload(uses: Uses, assistant: AssistantId): string | null {
  if (uses === assistant || assistant === "grok") return null;
  return ASSISTANT_DOWNLOAD[assistant];
}
