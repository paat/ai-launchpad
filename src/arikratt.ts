import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Db } from "./db.js";
import { nowIso } from "./db.js";
import { SYNTHETIC_COMPANIES } from "./fixtures.js";
import { validRegistryCode, type CompanyFacts, type Fact } from "./obligations.js";

/** Public-register facts via the Ärikratt MCP (external dependency). Reads
 * company-level fields only: natural-person data (board members etc.) is never
 * read, stored or returned. Only derived facts are cached, never raw responses. */
export const ARIKRATT_ATTRIBUTION = "Äriregister (CC BY 4.0) ja EMTA avaandmed (CC BY-SA 3.0) Ärikratt MCP kaudu; ei ole ametlik registriväljavõte. / Business Register (CC BY 4.0) and EMTA open data (CC BY-SA 3.0) via the Ärikratt MCP; not an official register extract.";
export const CACHE_TTL_MS = 24 * 3600_000;

export interface CompanyCard {
  name: string | null; registry_code: string; synthetic: boolean;
  provenance: "public_register" | "synthetic_fixture" | "assistant_supplied"; label_et: string; label_en: string;
  snapshot_id: string | null; as_of: string | null; sources: string[]; attribution: string;
}
export type Unavailable = "not_configured" | "invalid_code" | "not_found" | "timeout" | "unauthorized" | "error";
export type Lookup = { ok: true; company: CompanyCard; facts: CompanyFacts; confirm: string[] } | { ok: false; unavailable: Unavailable; reason: string };
export interface ArikrattConfig { apiKey?: string; url?: string; timeoutMs?: number; }
export interface CompanyMatch { name: string; registry_code: string; }

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Field mapping per memo § 4. Only the paths below are ever read. */
export function mapCompany(code: string, raw: unknown): { company: CompanyCard; facts: CompanyFacts; confirm: string[] } {
  const r = rec(raw), profile = rec(r.profile), status = rec(r.report_status), debt = rec(r.tax_debt);
  const as_of = str(r.as_of);
  const fact = <T>(value: T): Fact<T> => ({ value, provenance: "public_register", source: "arikratt:get_company", ...(as_of ? { as_of } : {}) });
  const tax = (Array.isArray(r.tax) ? r.tax : []).map(rec).sort((a, b) => (num(b.year) ?? 0) - (num(a.year) ?? 0) || (num(b.quarter) ?? 0) - (num(a.quarter) ?? 0));
  const facts: CompanyFacts = { registry_code: fact(code) };
  const name = str(profile.name) ?? str(r.name);
  if (name) facts.company_name = fact(name);
  const confirm: string[] = [];
  if ("vat_number" in profile) {
    const registered = str(profile.vat_number) !== null;
    facts.vat_registered = fact(registered);
    // U6: a VAT number with no declared turnover for 2+ quarters → ask the owner.
    if (registered && tax.length >= 2 && tax.slice(0, 2).every((q) => num(q.turnover) === null)) confirm.push("vat_registered");
  }
  if (tax[0]) {
    const labour = num(tax[0].labour_taxes), staff = num(tax[0].employee_count);
    if (labour !== null) facts.labour_taxes_last_quarter = fact(labour);
    if (staff !== null) facts.employees = fact(staff);
  }
  if (Object.keys(status).length) facts.annual_report = fact({ latest_year: num(status.latest_year), filed: typeof status.filed === "boolean" ? status.filed : null, overdue_days: num(status.overdue_days) });
  if (typeof debt.on_list === "boolean") facts.tax_debt_on_list = fact(debt.on_list);
  const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => str(s) ?? str(rec(s).url)).filter((s): s is string => !!s && s.startsWith("https://")).slice(0, 10);
  return { company: { name, registry_code: code, synthetic: false, provenance: "public_register", label_et: `Ametlik allikas · Äriregister ja EMTA${as_of ? `, seisuga ${as_of}` : ""}`, label_en: `Official source · Business Register and EMTA${as_of ? `, as of ${as_of}` : ""}`, snapshot_id: str(r.snapshot_id), as_of, sources, attribution: ARIKRATT_ATTRIBUTION }, facts, confirm };
}

export function arikratt(db: Db, cfg: ArikrattConfig) {
  const url = cfg.url || "https://arikratt.ee/mcp", timeoutMs = cfg.timeoutMs ?? 10_000;
  async function call(name: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; unavailable: Unavailable; reason: string }> {
    const signal = AbortSignal.timeout(timeoutMs);
    const client = new Client({ name: "ai-launchpad", version: "0.2.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { "X-API-Key": cfg.apiKey! } } }), { signal, timeout: timeoutMs });
      const r = await client.callTool({ name, arguments: args }, undefined, { signal, timeout: timeoutMs }) as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
      const text = r.content?.find((c) => c.type === "text")?.text ?? "";
      if (r.isError) return /not found|ei leitud|ei leia/i.test(text) ? { ok: false, unavailable: "not_found", reason: "The public register has no company with this code." } : { ok: false, unavailable: "error", reason: "The public-register lookup returned an error." };
      return { ok: true, data: r.structuredContent ?? JSON.parse(text) };
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (signal.aborted) return { ok: false, unavailable: "timeout", reason: `The public-register lookup did not answer within ${timeoutMs / 1000} s.` };
      if (code === 401 || code === 403) return { ok: false, unavailable: "unauthorized", reason: "The public-register service rejected Launchpad's API key." };
      return { ok: false, unavailable: "error", reason: "The public-register service could not be reached or answered unexpectedly." };
    } finally { await client.close().catch(() => {}); }
  }
  return {
    configured: !!cfg.apiKey,
    async lookup(code: string): Promise<Lookup> {
      const synthetic = SYNTHETIC_COMPANIES[code];
      if (synthetic) return { ok: true, facts: synthetic.facts, confirm: [], company: { name: synthetic.name, registry_code: code, synthetic: true, provenance: "synthetic_fixture", label_et: "Näidis · väljamõeldud ettevõte", label_en: "Sample · made-up company", snapshot_id: null, as_of: synthetic.facts.company_name?.as_of ?? null, sources: [], attribution: "Synthetic fixture; no real register data." } };
      if (!validRegistryCode(code)) return { ok: false, unavailable: "invalid_code", reason: "This is not a valid Estonian registry code (8 digits with a valid checksum)." };
      if (!cfg.apiKey) return { ok: false, unavailable: "not_configured", reason: "Public-register lookup is not configured on this server." };
      const hit = db.prepare("SELECT facts_json,fetched_at FROM company_facts WHERE registry_code=?").get(code) as { facts_json: string; fetched_at: string } | undefined;
      if (hit && Date.now() - Date.parse(hit.fetched_at) < CACHE_TTL_MS) return { ok: true, ...JSON.parse(hit.facts_json) };
      const r = await call("get_company", { registry_code: code, sections: ["report_status", "tax"] });
      if (!r.ok) return r;
      const mapped = mapCompany(code, r.data);
      db.prepare("INSERT INTO company_facts(registry_code,facts_json,snapshot_id,as_of,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(registry_code) DO UPDATE SET facts_json=excluded.facts_json,snapshot_id=excluded.snapshot_id,as_of=excluded.as_of,fetched_at=excluded.fetched_at")
        .run(code, JSON.stringify(mapped), mapped.company.snapshot_id, mapped.company.as_of, nowIso());
      return { ok: true, ...mapped };
    },
    /** Name lookup: company name and registry code only, never people. */
    async search(name: string): Promise<{ ok: true; matches: CompanyMatch[] } | { ok: false; unavailable: Unavailable; reason: string }> {
      if (!cfg.apiKey) return { ok: false, unavailable: "not_configured", reason: "Public-register lookup is not configured on this server." };
      const r = await call("search_companies", { query: name, limit: 5 });
      if (!r.ok) return r;
      const list = Array.isArray(rec(r.data).companies) ? rec(r.data).companies as unknown[] : [];
      return { ok: true, matches: list.map(rec).map((c) => ({ name: str(c.name), registry_code: str(c.registry_code) })).filter((c): c is CompanyMatch => !!c.name && !!c.registry_code && validRegistryCode(c.registry_code)).slice(0, 5) };
    },
  };
}
export type Arikratt = ReturnType<typeof arikratt>;
