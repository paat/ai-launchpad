/** Which assistant to connect. A rule decides; a saved Muse card may only explain it.
 * Invalid or missing answers yield no result — the page asks the next question
 * and never guesses a default. */
export const USES = ["claude", "chatgpt", "grok", "other", "none"] as const;
export type Uses = (typeof USES)[number];
export const BUSINESSES = ["yes", "no", "unsure"] as const;
export type Business = (typeof BUSINESSES)[number];
export type AssistantId = "claude" | "chatgpt" | "grok";
export const REASON_IDS = ["already_claude", "already_grok", "chatgpt_business", "chatgpt_no_approvals", "other_untested", "none"] as const;
export type ReasonId = (typeof REASON_IDS)[number];

export interface AssistantChoice { assistant: AssistantId; reason: ReasonId; }

/** Grok Bot has no verified download page, so it is absent here. */
export const ASSISTANT_DOWNLOAD: Record<"claude" | "chatgpt", string> = {
  claude: "https://claude.ai/download",
  chatgpt: "https://chatgpt.com/download",
};

/** Plain sentences for the result screen, plus the dated source note. No jargon. */
export const REASONS: Record<ReasonId, { assistant: AssistantId; text: Record<"et" | "en", string>; source: Record<"et" | "en", string> }> = {
  already_claude: {
    assistant: "claude",
    text: { et: "Sa juba kasutad Claude'i. Jää selle juurde.", en: "You already use Claude. Stay with it." },
    source: {
      et: "Allikas: Claude'i tasuta paketis on kinnitused proovitud 30.10.2026.",
      en: "Source: approvals were tested on Claude's free plan, 30 Oct 2026.",
    },
  },
  already_grok: {
    assistant: "grok",
    text: { et: "Sa juba kasutad Groki. Jää selle juurde.", en: "You already use Grok. Stay with it." },
    source: {
      et: "Allikas: Grok Botis on kinnitused proovitud 1.11.2026.",
      en: "Source: approvals were tested on Grok Bot, 1 Nov 2026.",
    },
  },
  chatgpt_business: {
    assistant: "chatgpt",
    text: { et: "Sinu ettevõte maksab ChatGPT Businessi eest. Siis töötavad ka kinnitused.", en: "Your company pays for ChatGPT Business. Approvals work there too." },
    source: {
      et: "Allikas: ChatGPT-s vajavad kinnitused ChatGPT Business paketti.",
      en: "Source: on ChatGPT, approvals need ChatGPT Business.",
    },
  },
  chatgpt_no_approvals: {
    assistant: "claude",
    text: {
      et: "ChatGPT ilma Business paketita näeb tähtaegu, aga kinnitused vajavad ChatGPT Businessi. Claude'i tasuta pakett teeb kinnitused ära. ChatGPT võid teiste asjade jaoks alles jätta.",
      en: "ChatGPT without Business can read deadlines, but approvals need ChatGPT Business. Claude's free plan does approvals. You can keep ChatGPT for other things.",
    },
    source: {
      et: "Allikas: Claude'i tasuta paketis on kinnitused proovitud 30.10.2026. ChatGPT-s vajavad kinnitused ChatGPT Business paketti.",
      en: "Source: approvals were tested on Claude's free plan, 30 Oct 2026. On ChatGPT, approvals need ChatGPT Business.",
    },
  },
  other_untested: {
    assistant: "claude",
    text: { et: "Teisi assistente ei ole AI-hüppelauaga proovitud. Claude on.", en: "Other assistants are not tested with AI Launchpad. Claude is." },
    source: {
      et: "Allikas: Claude'i tasuta paketis on kinnitused proovitud 30.10.2026.",
      en: "Source: approvals were tested on Claude's free plan, 30 Oct 2026.",
    },
  },
  none: {
    assistant: "claude",
    text: { et: "Alusta Claude'iga. See on lihtsaim algus ja töötab ka tasuta paketis.", en: "Start with Claude. It is the easiest start and it works on the free plan too." },
    source: {
      et: "Allikas: Claude'i tasuta paketis on kinnitused proovitud 30.10.2026.",
      en: "Source: approvals were tested on Claude's free plan, 30 Oct 2026.",
    },
  },
};

export function parseUses(v: unknown): Uses | null {
  return v === "claude" || v === "chatgpt" || v === "grok" || v === "other" || v === "none" ? v : null;
}
export function parseBusiness(v: unknown): Business | null {
  return v === "yes" || v === "no" || v === "unsure" ? v : null;
}

/** Download page only when the recommended assistant is not the one they already use. */
export function offerDownload(uses: Uses, assistant: AssistantId): string | null {
  if (uses === assistant || assistant === "grok") return null;
  return ASSISTANT_DOWNLOAD[assistant];
}

export function chooseAssistant(answers: { uses?: unknown; business?: unknown }): AssistantChoice | null {
  const uses = parseUses(answers.uses);
  if (!uses) return null;
  if (uses === "chatgpt") {
    const business = parseBusiness(answers.business);
    if (!business) return null;
    return business === "yes" ? { assistant: "chatgpt", reason: "chatgpt_business" } : { assistant: "claude", reason: "chatgpt_no_approvals" };
  }
  if (uses === "claude") return { assistant: "claude", reason: "already_claude" };
  if (uses === "grok") return { assistant: "grok", reason: "already_grok" };
  if (uses === "other") return { assistant: "claude", reason: "other_untested" };
  return { assistant: "claude", reason: "none" };
}
