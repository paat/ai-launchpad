/** Thin developer wrapper: the actual batch parser/main lives in
 * src/model-public-cards-cli.ts so production releases run the compiled
 * dist/model-public-cards-cli.js with plain node (no scripts/*.ts or
 * tsx). This wrapper only re-exports it for existing developer commands
 * and tests (npx tsx scripts/model-public-cards.ts ...). */
import { pathToFileURL } from "node:url";
import { main } from "../src/model-public-cards-cli.js";

export * from "../src/model-public-cards-cli.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, (e: unknown) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exitCode = 1;
  });
}
