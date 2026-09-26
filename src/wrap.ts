import { stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/**
 * Separator inserted between two extension status texts.
 *
 * Matches the built-in footer, which joins statuses with a single space.
 */
export const STATUS_SEPARATOR = " ";

/**
 * Collapse a status text to a single display line.
 *
 * Mirrors the built-in footer's sanitizer: extensions may emit multi-line or
 * tabbed text, which would otherwise escape the wrapping logic and corrupt the
 * footer height.
 */
export function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

/**
 * Status texts in the built-in footer's order (alphabetical by status key).
 *
 * Empty texts are dropped so they cannot produce blank lines.
 */
export function orderStatusTexts(statuses: ReadonlyMap<string, string>): string[] {
  return [...statuses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeStatusText(text))
    .filter((text) => text.length > 0);
}

/**
 * Pack status texts into as many lines as they need.
 *
 * Items are never split across lines while they fit, so a status stays readable
 * as a unit. Only an item wider than the terminal on its own is hard-wrapped,
 * and that wrap is ANSI-aware.
 */
export function packStatusLines(
  items: readonly string[],
  width: number,
  separator: string = STATUS_SEPARATOR,
): string[] {
  const lineWidth = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  let current = "";

  for (const item of items) {
    const candidate = current ? `${current}${separator}${item}` : item;
    if (visibleWidth(candidate) <= lineWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (visibleWidth(item) <= lineWidth) {
      current = item;
      continue;
    }
    const wrapped = wrapTextWithAnsi(item, lineWidth);
    for (let index = 0; index < wrapped.length - 1; index++) {
      lines.push(wrapped[index] ?? "");
    }
    current = wrapped[wrapped.length - 1] ?? "";
  }

  if (current) lines.push(current);
  return lines;
}

/**
 * Append the statuses a footer did not render at all.
 *
 * A footer that owns its own layout (a "starship"-style status line, for
 * example) may drop status texts that do not fit its own budget. Those texts
 * are visible nowhere else, so re-append them below the footer's output, packed
 * at item boundaries.
 *
 * A status counts as rendered when its plain text appears inside a single
 * rendered line, so a line that was cut short still counts as missing and a
 * coincidental match across two lines cannot hide a dropped status.
 */
export function appendMissingStatuses(
  lines: readonly string[],
  statuses: ReadonlyMap<string, string>,
  width: number,
): string[] {
  const items = orderStatusTexts(statuses);
  if (items.length === 0) return [...lines];

  const rendered = lines.map((line) => stripTerminalSequences(line));
  const missing = items.filter((item) => {
    const plain = stripTerminalSequences(item);
    return plain.length > 0 && !rendered.some((line) => line.includes(plain));
  });
  if (missing.length === 0) return [...lines];

  return [...lines, ...packStatusLines(missing, width)];
}
