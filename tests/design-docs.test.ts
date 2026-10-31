import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Design docs point only at paths that are in the repo; prototypes kept outside it are named as such (tribunal T-004).
describe("design docs", () => {
  test("every backticked path in docs/design/{direction-a,progress} exists", () => {
    const dirs = ["docs/design/direction-a", "docs/design/progress"];
    const dead = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md")).flatMap((f) =>
      [...readFileSync(join(d, f), "utf8").matchAll(/`((?:design|docs|src|tests|e2e|scripts|deploy)\/[^`\s]*)`/g)].map((m) => m[1].replace(/:[\d,–-]+$/, "")).filter((p) => !existsSync(p)).map((p) => `${d}/${f}: ${p}`)));
    expect(dead).toEqual([]);
  });
});
