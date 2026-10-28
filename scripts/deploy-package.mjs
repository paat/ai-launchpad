#!/usr/bin/env node
// Build one immutable release tarball on the CI runner (never on production).
// Layout inside the tarball mirrors the runtime's expectations:
//   dist/server.js                          (built entrypoint)
//   docs/research/catalog/estonian-business-services.json
//        (src/catalog.ts resolves ../docs/... relative to dist/catalog.js)
//   node_modules/  production deps only, built for the target OS/ABI
//   package.json, package-lock.json, RELEASE-MANIFEST.json
// Usage: node scripts/deploy-package.mjs <40-hex-git-sha> <output.tar.gz>
// Prereqs (CI does this): `npm ci && npm run build`, then this script stages
// fresh production deps with `npm ci --omit=dev` inside the staging dir, so
// the better-sqlite3 native binary matches the runner (ubuntu-24.04/Node 22).
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const [sha, out] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !out) {
  console.error("usage: deploy-package.mjs <40-hex-git-sha> <output.tar.gz>");
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (head !== sha) { console.error(`HEAD ${head} != requested SHA ${sha}`); process.exit(1); }
// Release policy comes ONLY from the requested commit's git object —
// never argv, env, or the (possibly dirty) worktree. Missing/invalid
// committed policy fails closed; there is no default fallback.
let policy;
try { policy = execFileSync("git", ["show", `${sha}:deploy/release-mode`], { cwd: root }).toString("utf8"); }
catch { console.error(`missing committed deploy/release-mode at ${sha}`); process.exit(1); }
if (policy !== "disabled\n" && policy !== "public_cards\n") { console.error("invalid committed deploy/release-mode (exact 'disabled\\n' or 'public_cards\\n' required)"); process.exit(1); }
const releaseMode = policy.trim();
if (!process.versions.node.startsWith("22.")) { console.error(`Node 22 required, got ${process.version}`); process.exit(1); }
for (const p of ["dist/server.js", "docs/research/catalog/estonian-business-services.json", "package.json", "package-lock.json"]) {
  if (!existsSync(join(root, p))) { console.error(`missing ${p}; run npm ci && npm run build first`); process.exit(1); }
}

const stage = join(root, ".deploy-stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "docs/research/catalog"), { recursive: true });
// dist is copied through a fixed allowlist only: the actual tsc build
// outputs for this tsconfig (outDir dist, no declarations) — generated
// JavaScript and its source maps, at any nesting depth. Every other
// dist file (hidden .env, databases, keys, stray files) is rejected
// from the artifact.
(function copyDist(dir, rel) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), r = rel ? `${rel}/${name}` : name, st = lstatSync(p);
    if (st.isSymbolicLink()) { console.error(`symlink in dist (forbidden): dist/${r}`); process.exit(1); }
    if (st.isDirectory()) { copyDist(p, r); continue; }
    if (!st.isFile()) { console.error(`non-regular file in dist (forbidden): dist/${r}`); process.exit(1); }
    if (!/\.js(?:\.map)?$/.test(name)) { console.error(`excluding non-build-output dist file: dist/${r}`); continue; }
    const dest = join(stage, "dist", r);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(p, dest);
  }
})(join(root, "dist"), "");
cpSync(join(root, "docs/research/catalog/estonian-business-services.json"), join(stage, "docs/research/catalog/estonian-business-services.json"));
for (const f of ["package.json", "package-lock.json"]) cpSync(join(root, f), join(stage, f));
execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: stage, stdio: "inherit" });
// npm's .bin symlinks are the only symlinks in these deps; drop them so the
// host-side extractor can reject *all* symlinks without exceptions.
rmSync(join(stage, "node_modules/.bin"), { recursive: true, force: true });
// Manifest-bound release identity: written BEFORE the manifest inventory
// so it is hash-covered like every other release file. Exact content only:
// SHA line then the committed policy as MODEL_MODE (nonsecret, no paths).
writeFileSync(join(stage, "release.env"), `LAUNCHPAD_RELEASE_SHA=${sha}\nMODEL_MODE=${releaseMode}\n`);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), st = lstatSync(p);
    if (st.isSymbolicLink()) { console.error(`symlink in artifact (forbidden): ${relative(stage, p)}`); process.exit(1); }
    if (st.isDirectory()) walk(p);
    else if (st.isFile()) files.push(relative(stage, p));
  }
})(stage);
const manifest = {
  git_sha: sha,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  files: Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(join(stage, f))).digest("hex")])),
};
writeFileSync(join(stage, "RELEASE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
mkdirSync(dirname(join(root, out)), { recursive: true });
execFileSync("tar", ["-czf", join(root, out), "-C", stage, "."], { stdio: "inherit" });
rmSync(stage, { recursive: true, force: true });
const digest = createHash("sha256").update(readFileSync(join(root, out))).digest("hex");
writeFileSync(join(root, out + ".sha256"), `${digest}  ${out.split("/").pop()}\n`);
console.log(`packaged ${sha} -> ${out} sha256=${digest} files=${files.length}`);
