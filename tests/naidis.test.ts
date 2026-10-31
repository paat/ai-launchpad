import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";
import { NAIDIS } from "../src/naidis.js";
import { fmtEur } from "../src/views.js";

let server: Server, base = "";
const cfg: Config = { demo: false, production: true, dbPath: ":memory:", baseUrl: "https://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: ["synthetic-subject"] };
const { app, db } = createApp(cfg, openDb(":memory:"));
const sessionCookie = "lp_session=synthetic-signed-in-session";
const routes = [
  { path: "/naidis", current: "/naidis", step: "1. Täna", enStep: "1. Today" },
  { path: "/naidis/kinnitus", current: "/naidis/kinnitus", step: "2. Kinnitus", enStep: "2. Approval" },
  { path: "/naidis/kinnitus/appr_sent_2", current: "/naidis/kinnitus", step: "2. Kinnitus", enStep: "2. Approval" },
  { path: "/naidis/tehtud", current: "/naidis/tehtud", step: "3. Tehtud", enStep: "3. Done" },
] as const;
const counts = () => Object.fromEntries(["activity", "approvals", "owners"].map((table) => [table, (db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n]));

beforeAll(async () => {
  db.prepare("INSERT INTO owners(id,subject,email,kind,reporting_enabled,created_at) VALUES(?,?,?,?,0,?)").run("own_synthetic", "google:synthetic-subject", null, "google", "2026-11-03T10:00:00Z");
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("synthetic-signed-in-session"), "own_synthetic", "synthetic-csrf", "2027-01-01T00:00:00Z");
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  const port = (server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  cfg.baseUrl = `https://127.0.0.1:${port}`;
});
afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
  db.close();
});

function expectReadOnly(html: string) {
  const open = '<fieldset disabled class="naidis-ro">', start = html.indexOf(open), end = html.indexOf("</fieldset>", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const controls = [...html.matchAll(/<(?:form|input|select|textarea|button)\b/g)];
  for (const control of controls) {
    expect(control.index, control[0]).toBeGreaterThan(start);
    expect(control.index, control[0]).toBeLessThan(end);
  }
  for (const route of ["approvals", "activity", "playbooks", "connection", "unmet-needs"]) {
    expect(html).not.toMatch(new RegExp(`href="/${route}(?:[/?#"])`));
  }
  expect(html.slice(start, end)).not.toContain('href="/"');
  expect(html).not.toContain('href="/uhenda#kaest-ara"');
}

describe("#21 public synthetic walkthrough", () => {
  test.each(routes)("$path is public, cached, labelled and read-only in production mode", async ({ path, current, step }) => {
    const before = counts();
    const response = await fetch(`${base}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("vary")).toBe("Cookie");
    const html = await response.text();
    expect(html).toContain("Näidis: väljamõeldud ettevõte Mari Disain OÜ. Siin ei saa midagi kinnitada ega saata. Päris tööruumis teeb seda sinu assistent ja kinnitad sina.");
    expect(html).toContain('<nav class="naidis-steps" aria-label="Näidise sammud">');
    expect(html).toContain(`<a href="${current}" aria-current="page">${step}</a>`);
    expect(html.match(/<a\b[^>]*aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("Mari Disain OÜ");
    expect(html).not.toContain('class="main"');
    expectReadOnly(html);
    expect(counts()).toEqual(before);
  });

  test.each(routes)("$path honours English without setting a language cookie", async ({ path, current, enStep }) => {
    const before = counts();
    const response = await fetch(`${base}${path}?lang=en`);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Sample: the made-up company Mari Disain OÜ. Nothing can be approved or sent here. In a real workspace your assistant does this and you approve.");
    expect(html).toContain('<nav class="naidis-steps" aria-label="Sample steps">');
    expect(html).toContain(`<a href="${current}?lang=en" aria-current="page">${enStep}</a>`);
    const sampleHrefs = [...html.matchAll(/<a\b[^>]*href="(\/naidis[^"]*)"[^>]*>/g)]
      .filter((match) => !match[0].includes('class="lang-toggle"')).map((match) => match[1]);
    expect(sampleHrefs.length).toBeGreaterThan(0);
    for (const href of sampleHrefs) expect(new URL(href, base).searchParams.get("lang"), href).toBe("en");
    expectReadOnly(html);
    expect(counts()).toEqual(before);
  });

  test("a signed-in visitor gets the same public shell and no new cookie or writes", async () => {
    const before = counts();
    const response = await fetch(`${base}/naidis`, { headers: { cookie: sessionCookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const html = await response.text();
    expect(html).toContain('<fieldset disabled class="naidis-ro">');
    expect(html).not.toContain('class="main"');
    expect(html).not.toContain("/auth/logout");
    expectReadOnly(html);
    expect(counts()).toEqual(before);
  });

  test("Täna has sent and paid reminders plus prepared work; Kinnitus is the shared pending row", async () => {
    const today = await (await fetch(`${base}/naidis`)).text();
    expect(today).toContain("Saadetud: demo");
    expect(today).toContain("Makstud: demo");
    expect(today).toContain("Valmistas ette: KMD ettevalmistus");
    expect(today).toContain("Käest ära:");
    const approval = await (await fetch(`${base}/naidis/kinnitus`)).text();
    expect(approval).toContain(NAIDIS.pendingApproval.id);
    expect(approval).toContain(`action="/approvals/${NAIDIS.pendingApproval.id}/decide"`);
    expect(approval).toContain("Assistent küsib kinnitust täpselt sellele saajale, summale ja perioodile. Muudatus vajab uut kinnitust.");
  });

  test("Tehtud has a sent receipt, „Käest ära” and the closing connection action", async () => {
    const html = await (await fetch(`${base}/naidis/tehtud`)).text();
    expect(html).toContain("Saadetud: demo");
    expect(html).toContain("Käest ära:");
    expect(html).toContain("Iga toimingu kviitung ja see, mis on sinu käest ära.");
    expect(html).toContain('<p class="naidis-cta"><a class="btn" href="/uhenda">Ühenda oma assistent</a></p>');
  });

  test("every rendered approval link resolves to that approval's recipient and amount", async () => {
    const approvals = [NAIDIS.longApproval, NAIDIS.pendingApproval, NAIDIS.longLetterApproval, NAIDIS.approvedApproval, ...NAIDIS.week2];
    for (const source of ["/naidis", "/naidis/tehtud"]) {
      const html = await (await fetch(`${base}${source}`)).text();
      const hrefs = [...html.matchAll(/href="(\/naidis\/kinnitus\/[^"]+)"/g)].map((match) => match[1]);
      expect(hrefs.length, source).toBeGreaterThan(0);
      for (const href of new Set(hrefs)) {
        const url = new URL(href, base), id = decodeURIComponent(url.pathname.split("/").pop()!);
        const approval = approvals.find((a) => a.id === id);
        expect(approval, href).toBeDefined();
        const payload = JSON.parse(approval!.payload_json) as { recipient: { name: string }; amount_cents: number };
        const response = await fetch(url);
        expect(response.status, href).toBe(200);
        const receipt = await response.text();
        expect(receipt).toContain(id);
        expect(receipt).toContain(payload.recipient.name);
        expect(receipt).toContain(fmtEur(payload.amount_cents, "et"));
      }
    }
  });

  test("an unknown synthetic approval id renders a 404 page without writes", async () => {
    const before = counts();
    const response = await fetch(`${base}/naidis/kinnitus/not-a-sample-approval`);
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain("Kinnitust ei leitud");
    expect(counts()).toEqual(before);
  });

  test("sent and paid receipts do not wait for their reported outcomes", async () => {
    const sent = await (await fetch(`${base}/naidis/kinnitus/appr_sent_1`)).text();
    expect(sent).toContain("Saadetud: demo");
    expect(sent).not.toContain("Saadetud: ootab assistendi teadet");
    const paid = await (await fetch(`${base}/naidis/kinnitus/appr_sent_2`)).text();
    expect(paid).toContain("Makstud: demo");
    expect(paid).not.toContain("Makstud: ootab");
  });

  test("the handover strip links to the detailed section on Tehtud", async () => {
    const today = await (await fetch(`${base}/naidis`)).text();
    expect(today).toContain('<a class="ho-strip" href="/naidis/tehtud#kaest-ara"');
    const done = await (await fetch(`${base}/naidis/tehtud`)).text();
    expect(done).toContain('<section class="section ho" id="kaest-ara"');
  });

  test("read-only controls have disabled styling", async () => {
    const html = await (await fetch(`${base}/naidis`)).text();
    expect(html).toContain(".naidis-ro :disabled{opacity:.55;cursor:not-allowed}");
  });

  test("the landing hero links to the sample and keeps its primary connection action", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('<div class="landing-actions"><a class="btn" href="/uhenda">Ühenda oma assistent</a><a class="tap-link" href="/naidis">Vaata näidist</a></div>');
  });

  test("POSTing the synthetic approval id keeps the normal unauthorised response and changes nothing", async () => {
    const before = counts();
    const response = await fetch(`${base}/approvals/${NAIDIS.pendingApproval.id}/decide`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `decision=approve&digest=${NAIDIS.pendingApproval.digest}` });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
    expect(counts()).toEqual(before);
  });
});
