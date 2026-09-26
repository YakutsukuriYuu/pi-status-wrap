import assert from "node:assert/strict";
import { test } from "node:test";
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { installFooterStatusWrap, wrapFooterStatusLines, type StatusFooter } from "../src/footer-patch.ts";

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
