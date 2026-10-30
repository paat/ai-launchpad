/** Read-only iCalendar feed of the owner's computed deadlines (issue #29).
 * Pure: no I/O, no model. RFC 5545 text rules: CRLF line endings, lines
 * folded at 75 octets without splitting a UTF-8 character, TEXT escaping. */
import type { Obligation } from "./obligations.js";

/** RFC 5545 § 3.3.11 TEXT: backslash, semicolon, comma and newlines are escaped. */
export const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r\n|\r|\n/g, "\\n");

/** RFC 5545 § 3.1: at most 75 octets per line; continuation lines start with one space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "", octets = 0;
  for (const ch of line) { // code points: a multibyte character is never split
    const n = Buffer.byteLength(ch, "utf8");
    if (octets + n > 75) { out.push(cur); cur = " "; octets = 1; }
    cur += ch; octets += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

const ymd = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export const ICS_DISCLAIMER = "Tähtaeg on arvutatud reeglist, mitte esitatud ega makstud.";
export const ICS_NO_COMPANY = "Ettevõte pole veel teada — palu assistendil hinnang salvestada";

export interface FeedInput {
  host: string; now: Date;
  /** Public register name or synthetic fixture name; null when unknown. */
  company: { name: string; synthetic: boolean } | null;
  obligations: Obligation[];
  /** Set for every state without events: no company, register unavailable. */
  emptyReason?: string;
}

/** One VEVENT per dated obligation; an empty state carries its reason in X-WR-CALDESC and no events. */
export function deadlinesCalendar(f: FeedInput): string {
  const label = f.company ? `${f.company.name}${f.company.synthetic ? " (näidis)" : ""}` : null;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AI-huppelaud//Tahtajad//ET", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(label ? `AI-hüppelaud · ${label}` : "AI-hüppelaud")}`,
    `X-WR-CALDESC:${icsText(f.emptyReason ?? "Tähtajad on arvutatud reeglitest. Kalender uueneb mõne tunni jooksul; kinnitada saab ainult assistendi kaudu.")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"];
  if (!f.emptyReason) for (const o of f.obligations) {
    if (!o.effective_due) continue;
    const summary = `${f.company?.synthetic ? "NÄIDIS · " : ""}${o.applies === "if" ? "Võimalik: " : ""}${o.title_et} · ${o.period_label_et}`;
    const description = [
      ...(o.applies === "if" && o.condition_et ? [`Tingimus: ${o.condition_et}`] : []),
      `Assistent: ${o.handoff.assistant_et} / Sina: ${o.handoff.owner_et}`,
      `Ütle oma assistendile: „${o.handoff.prompt_et}”`,
      `Allikas: ${o.source.act_et} ${o.source.section} ${o.source.url}`,
      ICS_DISCLAIMER,
    ].join("\n");
    // The period key is the statutory due date: fixed per rule and period, unaffected by holiday shifts.
    lines.push("BEGIN:VEVENT", `UID:${o.rule_id}-${ymd(o.statutory_due ?? o.effective_due)}@${f.host}`, `DTSTAMP:${stamp(f.now)}`,
      `DTSTART;VALUE=DATE:${ymd(o.effective_due)}`, `DTEND;VALUE=DATE:${ymd(nextDay(o.effective_due))}`,
      `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(description)}`, `URL:${o.source.url}`, "TRANSP:TRANSPARENT");
    for (const trigger of ["-P7D", "-P1D"]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${icsText(summary)}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
