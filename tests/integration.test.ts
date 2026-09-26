import assert from "node:assert/strict";
import { test } from "node:test";
import { FooterComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { installFooterStatusWrap } from "../src/footer-patch.ts";

// FooterComponent renders through the process-wide theme singleton.
initTheme("dark", false);

const NARROW = 24;
const WIDE = 120;

const STATUSES = new Map([
  ["mcp", "MCP 1/1"],
  ["ssh-remote", "SSH: Connected"],
  ["tokenSpeed", "TPS: 42.0 tok/s"],
]);

/**
 * Minimal stand-in for the pieces `FooterComponent.render` reads: session
 * state, entries, cwd/session name, context usage, provider subscription
 * lookup, and the footer data provider.
 */
function makeFooter(statuses: ReadonlyMap<string, string>) {
  return {
    autoCompactEnabled: false,
    session: {
      state: {
        model: { id: "gpt-5", provider: "openai", reasoning: false, contextWindow: 128_000 },
        thinkingLevel: "off",
      },
      sessionManager: {
        getEntries: () => [],
        getCwd: () => "/tmp",
        getSessionName: () => undefined,
      },
      getContextUsage: () => ({ contextWindow: 128_000, percent: 1, tokens: 1_280 }),
      modelRuntime: { isUsingSubscription: () => false },
    },
    footerData: {
      getExtensionStatuses: () => statuses,
      getGitBranch: () => null,
      getAvailableProviderCount: () => 1,
    },
  };
}

/** Call the live (possibly patched) `FooterComponent.render` against a fake instance. */
function renderFooter(footer: ReturnType<typeof makeFooter>, width: number): string[] {
  const lines: string[] = FooterComponent.prototype.render.call(footer, width);
  return lines.map((line) => stripTerminalSequences(line));
}

test("narrow terminal: built-in footer truncates, patched footer wraps", () => {
  const footer = makeFooter(STATUSES);

  const before = renderFooter(footer, NARROW);
  assert.equal(before.length, 3, "built-in footer emits cwd, stats, and one status line");
  assert.ok(!before[2]?.includes("tok/s"), `expected tokenSpeed to be cut, got ${JSON.stringify(before[2])}`);

  installFooterStatusWrap();

  const after = renderFooter(footer, NARROW);
  // cwd line, stats line, then one wrapped line per status group.
  assert.deepEqual(after.slice(2), ["MCP 1/1 SSH: Connected", "TPS: 42.0 tok/s"]);
  assert.equal(after.length, 4);
  // The leading footer lines are untouched.
  assert.equal(after[0], before[0]);
  assert.equal(after[1], before[1]);
});

test("wide terminal: patched footer keeps the single status line", () => {
  installFooterStatusWrap();

  const after = renderFooter(makeFooter(STATUSES), WIDE);
  assert.equal(after.length, 3);
  assert.equal(after[2], "MCP 1/1 SSH: Connected TPS: 42.0 tok/s");
});

test("no statuses: patched footer is byte-identical to the built-in", () => {
  const footer = makeFooter(new Map());

  const plain = FooterComponent.prototype.render.call(footer, NARROW);
  installFooterStatusWrap();
  const patched = FooterComponent.prototype.render.call(footer, NARROW);

  assert.deepEqual(patched, plain);
  assert.equal(patched.length, 2);
});
