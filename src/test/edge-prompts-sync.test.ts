import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("edge-function prompt sync", () => {
  it("every .ts mirror matches its source-of-truth .md", () => {
    // Fails (non-zero exit) if any sidecar .ts is stale vs its .md.
    // Fix: `npm run prompts:sync`
    expect(() =>
      execSync("node scripts/sync-edge-prompts.mjs --check", { stdio: "pipe" }),
    ).not.toThrow();
  });
});
