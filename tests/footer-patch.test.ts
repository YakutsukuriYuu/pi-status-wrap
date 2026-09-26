import assert from "node:assert/strict";
import { test } from "node:test";
import { FooterComponent, InteractiveMode } from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
  installCustomFooterWrap,
  installFooterStatusWrap,
  wrapFooterComponent,
  wrapFooterStatusLines,
  type CustomFooterHost,
  type FooterLike,
  type StatusFooter,
} from "../src/footer-patch.ts";

class FakeFooter implements StatusFooter {
  statuses = new Map<string, string>();
  footerData: { getExtensionStatuses: () => ReadonlyMap<string, string> } = {
    getExtensionStatuses: () => this.statuses,
  };
  render(_width: number): string[] {
    return ["~ (main)", "↑1k ↓2k", "truncated status"];
  }
}

test("wrapFooterStatusLines replaces the trailing status line", () => {
  const footer = new FakeFooter();
  footer.statuses.set("mcp", "MCP 3/3");
  assert.deepEqual(wrapFooterStatusLines(["pwd", "stats", "cut"], footer, 20), ["pwd", "stats", "MCP 3/3"]);
});

test("wrapFooterStatusLines leaves the footer alone without statuses", () => {
  const footer = new FakeFooter();
  const lines = ["pwd", "stats"];
  assert.equal(wrapFooterStatusLines(lines, footer, 20), lines);
});

test("wrapFooterStatusLines leaves a statusless two-line footer alone", () => {
  const footer = new FakeFooter();
  footer.statuses.set("mcp", "MCP 3/3");
  assert.deepEqual(wrapFooterStatusLines(["pwd", "stats"], footer, 20), ["pwd", "stats"]);
});

test("installed patch wraps statuses across lines and keeps the head", () => {
  class Patched extends FakeFooter {}
  installFooterStatusWrap(Patched.prototype);

  const footer = new Patched();
  footer.statuses.set("mcp", "MCP 3/3");
  footer.statuses.set("tokenSpeed", "TPS: 42.0 tok/s");

  const out = footer.render(12);
  assert.deepEqual(out.slice(0, 2), ["~ (main)", "↑1k ↓2k"]);
  assert.ok(out.length > 3, `expected wrapped output, got ${JSON.stringify(out)}`);
  assert.equal(out.join(" ").replace(/\s+/g, " "), "~ (main) ↑1k ↓2k MCP 3/3 TPS: 42.0 tok/s");
});

test("installed patch is idempotent across reloads", () => {
  class Patched extends FakeFooter {}
  installFooterStatusWrap(Patched.prototype);
  installFooterStatusWrap(Patched.prototype);

  const footer = new Patched();
  footer.statuses.set("mcp", "MCP 3/3");
  assert.deepEqual(footer.render(20).slice(2), ["MCP 3/3"]);
});

test("default install patches the real FooterComponent prototype once", () => {
  const before = FooterComponent.prototype.render;
  installFooterStatusWrap();
  const afterFirst = FooterComponent.prototype.render;

  assert.notEqual(afterFirst, before);

  installFooterStatusWrap();
  assert.equal(FooterComponent.prototype.render, afterFirst);
});

test("installed patch falls back when the status lookup throws", () => {
  class Patched extends FakeFooter {}
  installFooterStatusWrap(Patched.prototype);

  const footer = new Patched();
  footer.footerData = {
    getExtensionStatuses(): ReadonlyMap<string, string> {
      throw new Error("boom");
    },
  };

  assert.deepEqual(footer.render(20), ["~ (main)", "↑1k ↓2k", "truncated status"]);
});

// ---------------------------------------------------------------------------
// Custom footers (ctx.ui.setFooter), e.g. a starship-style footer that owns its
// own layout and drops statuses that do not fit its budget.
// ---------------------------------------------------------------------------

const CUSTOM_STATUSES = new Map([
  ["mcp", "MCP 1/1"],
  ["ssh-remote", "SSH: Connected"],
  ["tokenSpeed", "TPS: 42.0 tok/s"],
]);

type SetFooterArg = Parameters<ExtensionUIContext["setFooter"]>[0];

const stubProvider: ReadonlyFooterDataProvider = {
  getExtensionStatuses: () => CUSTOM_STATUSES,
  getGitBranch: () => null,
  getAvailableProviderCount: () => 1,
  onBranchChange: () => () => {},
};

class RecordingHost implements CustomFooterHost {
  installed: FooterLike | undefined;

  setExtensionFooter(factory: SetFooterArg): void {
    // SAFETY: the test footers never read their tui or theme arguments.
    this.installed = factory ? factory({} as TUI, {} as Theme, stubProvider) : undefined;
  }
}

test("wrapFooterComponent appends statuses a custom footer dropped", () => {
  const component: FooterLike = {
    render: () => ["cwd on main", "1.0%/128k  gpt-5"],
    invalidate() {},
  };
  const wrapped = wrapFooterComponent(component, () => CUSTOM_STATUSES);

  assert.deepEqual(wrapped.render(40), [
    "cwd on main",
    "1.0%/128k  gpt-5",
    "MCP 1/1 SSH: Connected TPS: 42.0 tok/s",
  ]);
});

test("wrapFooterComponent leaves a footer that already shows every status alone", () => {
  const component: FooterLike = {
    render: () => ["MCP 1/1 SSH: Connected TPS: 42.0 tok/s"],
    invalidate() {},
  };
  const wrapped = wrapFooterComponent(component, () => CUSTOM_STATUSES);

  assert.deepEqual(wrapped.render(80), ["MCP 1/1 SSH: Connected TPS: 42.0 tok/s"]);
});

test("wrapFooterComponent forwards invalidate and dispose", () => {
  let invalidated = 0;
  let disposed = 0;
  const component: FooterLike = {
    render: () => [],
    invalidate() {
      invalidated += 1;
    },
    dispose() {
      disposed += 1;
    },
  };

  const wrapped = wrapFooterComponent(component, () => undefined);
  wrapped.invalidate();
  wrapped.dispose?.();

  assert.equal(invalidated, 1);
  assert.equal(disposed, 1);
});

test("installCustomFooterWrap covers footers installed through setFooter", () => {
  const host = new RecordingHost();
  installCustomFooterWrap(host);

  host.setExtensionFooter(() => ({ render: () => ["zentui footer"], invalidate() {} }));

  assert.deepEqual(host.installed?.render(40), [
    "zentui footer",
    "MCP 1/1 SSH: Connected TPS: 42.0 tok/s",
  ]);
});

test("installCustomFooterWrap passes restoration through unchanged", () => {
  const host = new RecordingHost();
  installCustomFooterWrap(host);

  host.setExtensionFooter(undefined);

  assert.equal(host.installed, undefined);
});

test("installCustomFooterWrap is idempotent per host", () => {
  const host = new RecordingHost();
  installCustomFooterWrap(host);
  const patched = host.setExtensionFooter;

  installCustomFooterWrap(host);

  assert.equal(host.setExtensionFooter, patched);
});

test("default install marks the real InteractiveMode prototype once", () => {
  installCustomFooterWrap();
  const marks = Object.getOwnPropertySymbols(InteractiveMode.prototype).map(String);

  assert.ok(
    marks.includes("Symbol(pi-status-wrap/custom-footer)"),
    `expected the custom-footer mark, got ${JSON.stringify(marks)}`,
  );

  const before = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionFooter")?.value;
  installCustomFooterWrap();
  const after = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionFooter")?.value;
  assert.equal(after, before);
});
