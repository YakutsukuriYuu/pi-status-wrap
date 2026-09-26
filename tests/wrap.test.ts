import assert from "node:assert/strict";
import { test } from "node:test";
import { appendMissingStatuses, orderStatusTexts, packStatusLines, sanitizeStatusText } from "../src/wrap.ts";

test("sanitizeStatusText collapses control characters", () => {
  assert.equal(sanitizeStatusText("a\nb\tc\r\n  d  "), "a b c d");
});

test("orderStatusTexts sorts by status key and drops empty texts", () => {
  const statuses = new Map([
    ["tokenSpeed", "TPS: 42.0 tok/s"],
    ["mcp", "MCP 3/3"],
    ["ssh-remote", "   "],
  ]);
  assert.deepEqual(orderStatusTexts(statuses), ["MCP 3/3", "TPS: 42.0 tok/s"]);
});

test("packStatusLines keeps everything on one line when it fits", () => {
  assert.deepEqual(packStatusLines(["aa", "bb"], 10), ["aa bb"]);
});

test("packStatusLines wraps at item boundaries", () => {
  assert.deepEqual(packStatusLines(["aaa", "bbb", "ccc"], 7), ["aaa bbb", "ccc"]);
});

test("packStatusLines hard-wraps a single over-wide item", () => {
  assert.deepEqual(packStatusLines(["abcdefgh"], 3), ["abc", "def", "gh"]);
});

test("packStatusLines measures ANSI-styled text by visible width", () => {
  const red = "\x1b[31mabc\x1b[0m";
  assert.deepEqual(packStatusLines([red, "d"], 4), [red, "d"]);
  assert.deepEqual(packStatusLines([red, "d"], 5), [`${red} d`]);
});

test("packStatusLines never drops information", () => {
  const items = ["mcp: 3/3", "ssh: connected", "tps: 42.0 tok/s"];
  const lines = packStatusLines(items, 12);
  const plain = lines.join(" ").replace(/\s+/g, " ");
  for (const item of items) assert.ok(plain.includes(item), `missing: ${item}`);
});

test("packStatusLines returns nothing for no items", () => {
  assert.deepEqual(packStatusLines([], 10), []);
});

test("packStatusLines tolerates a zero width", () => {
  assert.deepEqual(packStatusLines(["ab"], 0), ["a", "b"]);
});

test("appendMissingStatuses appends everything when the footer shows none", () => {
  const statuses = new Map([
    ["mcp", "MCP 1/1"],
    ["tokenSpeed", "TPS: 42.0 tok/s"],
  ]);
  assert.deepEqual(appendMissingStatuses(["cwd on main"], statuses, 40), [
    "cwd on main",
    "MCP 1/1 TPS: 42.0 tok/s",
  ]);
});

test("appendMissingStatuses keeps only what the footer failed to show", () => {
  const statuses = new Map([
    ["mcp", "MCP 1/1"],
    ["ssh-remote", "SSH: Connected"],
    ["tokenSpeed", "TPS: 42.0 tok/s"],
  ]);
  assert.deepEqual(appendMissingStatuses(["cwd", "MCP 1/1"], statuses, 18), [
    "cwd",
    "MCP 1/1",
    "SSH: Connected",
    "TPS: 42.0 tok/s",
  ]);
});

test("appendMissingStatuses treats a cut-off status as missing", () => {
  const statuses = new Map([["tokenSpeed", "TPS: 42.0 tok/s"]]);
  assert.deepEqual(appendMissingStatuses(["TPS: 42.0 to…"], statuses, 40), [
    "TPS: 42.0 to…",
    "TPS: 42.0 tok/s",
  ]);
});

test("appendMissingStatuses ignores styling differences", () => {
  const statuses = new Map([["mcp", "\u001b[36mMCP 1/1\u001b[0m"]]);
  assert.deepEqual(appendMissingStatuses(["\u001b[2mMCP 1/1\u001b[0m"], statuses, 40), ["\u001b[2mMCP 1/1\u001b[0m"]);
});

test("appendMissingStatuses does nothing without statuses", () => {
  assert.deepEqual(appendMissingStatuses(["cwd"], new Map(), 40), ["cwd"]);
});
