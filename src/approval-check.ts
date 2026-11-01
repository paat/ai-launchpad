/** Advisory reading of an exact stored action. Only model-quality spends money;
 * this module never decides whether an action is approved or executable. */
import { createHash } from "node:crypto";
import {
  BASETEN_MODEL, ModelQualityError, runModelQualityAttempt,
  type FetchFn, type ModelQualityLedger,
} from "./model-quality.js";

export interface ApprovalCheckOutput {
  verdict: "ok" | "review";
  summary_et: string;
  summary_en: string;
  concerns_et: string[];
  concerns_en: string[];
}

export type CheckOutcome = { kind: "text"; text: string } | { kind: "failed"; reason: string };
export interface ApprovalChecker {
  readonly by: "mock" | typeof BASETEN_MODEL;
  check(approvalId: string, digest: string, input: string): Promise<CheckOutcome>;
}

interface StoredAction {
  kind: string;
  recipient: { name: string; address?: string };
  amount_cents?: number;
  currency: string;
  period?: string;
  document: { title: string; content: string };
  summary: string;
}

/** Use only the stored action and its stored approval metadata. No profile,
 * session, company context, tools or caller-supplied instructions are added. */
export function buildApprovalCheckInput(action: StoredAction, ownerConfirmation?: string | null, playbookId?: string | null): string {
  return JSON.stringify({
    kind: action.kind,
    recipient_name: action.recipient.name,
    recipient_address: action.recipient.address ?? null,
    amount_eur: action.amount_cents === undefined ? null : `${(action.amount_cents / 100).toFixed(2)} EUR`,
    amount_cents: action.amount_cents ?? null,
    currency: action.currency,
    period: action.period ?? null,
    document_title: action.document.title,
    document_content: action.document.content,
    assistant_summary: action.summary,
    owner_confirmation: ownerConfirmation ?? null,
    playbook_id: playbookId ?? null,
  });
}

const singleLine = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);

/** JSON only: no fences, added keys, coercion, repairs or text filters. */
export function parseApprovalCheck(text: string): { ok: true; value: ApprovalCheckOutput } | { ok: false; reason: "invalid_output" } {
  const invalid = { ok: false, reason: "invalid_output" } as const;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return invalid; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid;
  const o = value as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== "concerns_en,concerns_et,summary_en,summary_et,verdict") return invalid;
  if (o.verdict !== "ok" && o.verdict !== "review") return invalid;
  if (!singleLine(o.summary_et, 200) || !singleLine(o.summary_en, 200)) return invalid;
  if (!Array.isArray(o.concerns_et) || !Array.isArray(o.concerns_en)) return invalid;
  if (o.concerns_et.length !== o.concerns_en.length || o.concerns_et.length > 3) return invalid;
  if (o.verdict === "ok" ? o.concerns_et.length !== 0 : o.concerns_et.length === 0) return invalid;
  if (![...o.concerns_et, ...o.concerns_en].every((s) => singleLine(s, 160))) return invalid;
  return { ok: true, value: o as unknown as ApprovalCheckOutput };
}

export const approvalCheckRequestId = (approvalId: string, digest: string) =>
  `ac1.${createHash("sha256").update(approvalId).update("\0").update(digest).digest("hex").slice(0, 48)}`;

/** Deliberately small sample check: compare a money amount only. It is never
 * presented as inference or as a complete document review. */
export const mockChecker: ApprovalChecker = {
  by: "mock",
  async check(_approvalId, _digest, input) {
    const data = JSON.parse(input) as { amount_cents: number | null; document_content: string; recipient_name: string; kind: string };
    const cents = data.amount_cents;
    const number = String.raw`\d(?:[\d., \u00a0\u202f]*\d)?`;
    const money = new RegExp(String.raw`(?<![\d.,])(?:€\s*(${number})|\bEUR\s+(${number})|(${number})\s*(?:€|EUR\b|eurot?\b|euros?\b))(?!\d|[.,]\d)`, "giu");
    const amounts = [...data.document_content.matchAll(money)];
    const found = cents === null || amounts.some((m) => {
      const raw = (m[1] ?? m[2] ?? m[3]).replace(/[ \u00a0\u202f]/g, "");
      // Last punctuation with one or two trailing digits is the decimal
      // separator; other punctuation groups thousands in this sample.
      const decimal = raw.match(/[.,](\d{1,2})$/);
      const whole = decimal ? raw.slice(0, -decimal[0].length) : raw;
      return Number(whole.replace(/[.,]/g, "")) * 100 + Number((decimal?.[1] ?? "").padEnd(2, "0")) === cents;
    });
    const amount = cents === null ? "" : `, ${(cents / 100).toFixed(2)} EUR`;
    const name = data.recipient_name.replace(/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/gu, " ").slice(0, 65);
    const whatEt = data.kind === "send_invoice" ? "arve" : data.kind === "send_message" ? "sõnum" : "dokument";
    const whatEn = data.kind === "send_invoice" ? "an invoice" : data.kind === "send_message" ? "a message" : "a document";
    const output: ApprovalCheckOutput = {
      verdict: found ? "ok" : "review",
      summary_et: `Näidis, mitte mudel: ${name} saab ${whatEt}${amount}.`,
      summary_en: `Sample, not a model: ${name} receives ${whatEn}${amount}.`,
      concerns_et: found ? [] : ["Dokumendi tekstist ei leitud sama summat eurodes."],
      concerns_en: found ? [] : ["The same euro amount was not found in the document text."],
    };
    return { kind: "text", text: JSON.stringify(output) };
  },
};

/** One allocated attempt only, through the existing shared ledger. The caller
 * may wait and retry attempt_in_flight refusals, which allocate nothing. */
export function liveChecker(opts: { ledger: ModelQualityLedger; apiKey: string; fetchFn?: FetchFn }): ApprovalChecker {
  return {
    by: BASETEN_MODEL,
    async check(approvalId, digest, input) {
      try {
        const r = await runModelQualityAttempt({
          job: "check_approval", input, requestId: approvalCheckRequestId(approvalId, digest),
          ledger: opts.ledger, apiKey: opts.apiKey, fetchFn: opts.fetchFn, confirmCurrentPricing: true,
        });
        if (r.status === "completed" && r.output) {
          return parseApprovalCheck(r.output).ok ? { kind: "text", text: r.output } : { kind: "failed", reason: "invalid_output" };
        }
        if (r.status === "uncertain") return { kind: "failed", reason: r.errorCode === "timeout" ? "timeout" : "provider_uncertain" };
        if (r.status === "pending") return { kind: "failed", reason: "interrupted" };
        if (r.status === "provider_contract_breach") return { kind: "failed", reason: "provider_contract_breach" };
        if (r.errorCode === "invalid_response" || r.errorCode === "truncated") return { kind: "failed", reason: "invalid_output" };
        return { kind: "failed", reason: "provider_failed" };
      } catch (e) {
        const code = e instanceof ModelQualityError ? e.code : "";
        if (["budget_exhausted", "suppressed_after_breach", "attempt_in_flight", "request_conflict"].includes(code)) return { kind: "failed", reason: code };
        return { kind: "failed", reason: "unavailable" };
      }
    },
  };
}
