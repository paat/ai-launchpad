import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";
import { shell } from "../src/views.js";

let server: Server, base = "";
const cfg: Config = { demo: false, production: true, dbPath: ":memory:", baseUrl: "https://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: ["synthetic-subject"] };
const { app, db } = createApp(cfg, openDb(":memory:"));
const sessionCookie = "lp_session=synthetic-signed-in-session";
const counts = () => Object.fromEntries(["activity", "approvals", "owners"].map((table) => [table, (db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n]));

// The brief's copy has these five sections. There is no sixth heading in the spec.
const ET_H2 = ["Kellele see on", "Kuidas see töötab", "Meta mudelid", "Avatud lähtekood", "Taust"];
const EN_H2 = ["Who it is for", "How it works", "Meta's models", "Open source", "Background"];

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

function headings(html: string): string[] {
  return [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((match) => match[1]);
}

describe("public About page", () => {
  test("/meist is public Estonian by default, with the copy and a public cache", async () => {
    const before = counts();
    const response = await fetch(`${base}/meist`);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("vary")).toBe("Cookie");
    const html = await response.text();
    expect(html).toContain('<html lang="et">');
    expect(html).toContain("<title>Meist · AI-hüppelaud</title>");
    expect(html).toContain("<h1>Mis on AI-hüppelaud?</h1>");
    expect(html).toContain("AI-hüppelaud paneb sinu oma AI-assistendi — ChatGPT või Claude'i — tegema väikeettevõtte kontoritööd: tähtajad, arved, raamatupidamine, meeldetuletused. Sina saad tegeleda oma põhitööga.");
    expect(headings(html)).toEqual(ET_H2);
    expect(html).toContain("Eesti väikeettevõtjale, kes teeb kontoritöö ise. Esimesena ühe inimese OÜ, mille raamatud on e-arveldajas või Meritis.");
    expect(html).toContain("Neile, kes juba kasutavad ChatGPT-d või Claude'i ja tahavad, et see ka tööd teeks, mitte ainult vestleks.");
    expect(html).toContain("Neile, kes pole AI-assistenti veel kasutanud. Näitame rahulikult, kuidas alustada.");
    expect(html).toContain("Hiljem ka raamatupidajatele, kes hoiavad korras mitme väikeettevõtte asju.");
    expect(html).toContain("Sinu assistent on ainus kasutajaliides. AI-hüppelaud on üks ühendus, mille sa sellele lisad.");
    expect(html).toContain("Ettevõtte andmed tulevad avalikest registritest. Küsime ainult seda, mida keegi teine ei tea.");
    expect(html).toContain("Tähtajad ja maksud arvutab reeglistik, igaühel ametlik allikas. Tehisaru loeb ja kirjutab mustandeid.");
    expect(html).toContain("Midagi ei saadeta ega maksta ilma sinu kinnituseta just sellele toimingule. Iga tegevus jätab kviitungi.");
    expect(html).toContain("Smart-ID PIN-koodi, allkirja ja deklaratsiooni esitamise teed sina ise ametlikus kanalis. Meie seda sinu eest ei tee.");
    expect(html).toContain("Meta avatud mudel Muse Spark Open liigitab anonüümselt, mida ettevõtjad veel vajavad.");
    expect(html).toContain('<a href="/demand">Vaata avatud soove</a>');
    expect(html).toContain("Kood on avalik GitHubis MIT-litsentsiga.");
    expect(html).toContain('<a href="https://github.com/paat/ai-launchpad" rel="noopener noreferrer">github.com/paat/ai-launchpad</a>');
    expect(html).toContain("Leidsid vea või on sul soov? Kirjuta GitHubi.");
    expect(html).toContain('<a href="https://github.com/paat/ai-launchpad/issues" rel="noopener noreferrer">Ava teema GitHubis</a>');
    expect(html).toContain("Ehitatud Meta Global AI Developer Hackathoni ajal, 27. oktoobrist 4. novembrini 2026. See on piloot ja võib veel muutuda.");
    expect(html).toContain('tulevad <a href="https://arikratt.ee" rel="noopener noreferrer">Ärikrati</a> avaliku teenuse kaudu.');
    expect(html).toContain('<div class="landing-actions"><a class="btn" href="/uhenda">Ühenda oma assistent</a><a class="tap-link" href="/naidis">Vaata näidist</a></div>');
    expect(html).not.toContain('class="main"');
    expect(html).not.toContain("/auth/logout");
    expect(counts()).toEqual(before);
  });

  test("/meist?lang=en is English and is not publicly cached", async () => {
    const before = counts();
    const response = await fetch(`${base}/meist?lang=en`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>About · AI Launchpad</title>");
    expect(html).toContain("<h1>What is AI Launchpad?</h1>");
    expect(html).toContain("AI Launchpad puts your own AI assistant — ChatGPT or Claude — to work on your small business's office work: deadlines, invoices, bookkeeping, reminders. You get on with your real work.");
    expect(headings(html)).toEqual(EN_H2);
    expect(html).toContain("Estonian small-business owners who do their own office work. First, a one-person OÜ with its books in e-arveldaja or Merit.");
    expect(html).toContain("People who already use ChatGPT or Claude and want it to do work, not just chat.");
    expect(html).toContain("People who have never used an AI assistant. We show the way, calmly.");
    expect(html).toContain("Later, accountants who look after many small companies.");
    expect(html).toContain("Your assistant is the only interface. AI Launchpad is one connector you add to it.");
    expect(html).toContain("Company data comes from public registers. We ask only what nobody else knows.");
    expect(html).toContain("Deadlines and taxes are calculated by rules, each with an official source. AI reads and drafts.");
    expect(html).toContain("Nothing is sent or paid without your approval of that exact action. Every action leaves a receipt.");
    expect(html).toContain("Smart-ID PINs, signatures and filings stay with you, in the official channel. We never do them for you.");
    expect(html).toContain("Meta's open model Muse Spark Open anonymously classifies what businesses still need.");
    expect(html).toContain('<a href="/demand">See open demand</a>');
    expect(html).toContain("The code is public on GitHub under the MIT licence.");
    expect(html).toContain('<a href="https://github.com/paat/ai-launchpad" rel="noopener noreferrer">github.com/paat/ai-launchpad</a>');
    expect(html).toContain("Found a bug or have an idea? Tell us on GitHub.");
    expect(html).toContain('<a href="https://github.com/paat/ai-launchpad/issues" rel="noopener noreferrer">Open an issue on GitHub</a>');
    expect(html).toContain("Built during the Meta Global AI Developer Hackathon, 27 October – 4 November 2026. It is a pilot and may still change.");
    expect(html).toContain('through <a href="https://arikratt.ee" rel="noopener noreferrer">Ärikratt</a>\'s public service.');
    expect(html).toContain('<div class="landing-actions"><a class="btn" href="/uhenda">Connect your assistant</a><a class="tap-link" href="/naidis">See a sample</a></div>');
    expect(counts()).toEqual(before);
  });

  test("/about redirects to /meist and keeps only a valid lang query", async () => {
    const plain = await fetch(`${base}/about`, { redirect: "manual" });
    expect([plain.status, plain.headers.get("location")]).toEqual([302, "/meist"]);
    const en = await fetch(`${base}/about?lang=en`, { redirect: "manual" });
    expect([en.status, en.headers.get("location")]).toEqual([302, "/meist?lang=en"]);
    const bad = await fetch(`${base}/about?lang=xx`, { redirect: "manual" });
    expect([bad.status, bad.headers.get("location")]).toEqual([302, "/meist"]);
  });

  test("the anonymous landing page links to /meist from the footer", async () => {
    const html = await (await fetch(`${base}/`)).text();
    const footer = html.slice(html.lastIndexOf("<footer>"));
    expect(footer).toContain('<a href="/meist">Meist</a>');
  });

  test("a signed-in visitor gets the same public page and no database writes", async () => {
    const before = counts();
    const response = await fetch(`${base}/meist`, { headers: { cookie: sessionCookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const html = await response.text();
    expect(html).toContain("<h1>Mis on AI-hüppelaud?</h1>");
    expect(html).not.toContain('class="main"');
    expect(html).not.toContain("/auth/logout");
    const footer = html.slice(html.lastIndexOf("<footer>"));
    expect(footer).toContain('<a href="/meist">Meist</a>');
    expect(footer).not.toContain("/auth/logout");
    expect(counts()).toEqual(before);
  });

  test("the owner footer lists Meist last, and skipGuides still removes it", () => {
    const html = shell({ title: "Täna", active: "tana", csrf: "csrf-x", body: "<p>x</p>" });
    const guidesAt = html.indexOf('<nav class="guides"');
    const guides = html.slice(guidesAt, html.indexOf("</nav>", guidesAt));
    expect(guides.endsWith('<a href="/meist">Meist</a>')).toBe(true);
    expect(guides).toContain('<a href="/setup">Abi alustamiseks</a><a href="/meist">Meist</a>');
    const en = shell({ title: "Today", active: "tana", csrf: "csrf-x", body: "<p>x</p>", lang: "en" });
    const enAt = en.indexOf('<nav class="guides"');
    expect(en.slice(enAt, en.indexOf("</nav>", enAt)).endsWith('<a href="/meist">About</a>')).toBe(true);
    const skipped = shell({ title: "x", active: "none", csrf: "c", body: "", skipGuides: ["/meist", "/playbooks", "/setup", "/connection"] });
    expect(skipped).not.toContain('href="/meist"');
    expect(skipped).toContain('href="/approvals"');
    expect(skipped).not.toContain('href="/playbooks"');
  });
});
