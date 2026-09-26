import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { orderStatusTexts, packStatusLines } from "./wrap.ts";

/**
 * Marker stored on the footer prototype as an own property.
 *
 * Kept in the global symbol registry so a reloaded extension module cannot wrap
 * a wrapper: `installFooterStatusWrap` is a no-op once the mark is present.
 */
const PATCH_MARK = Symbol.for("pi-status-wrap/patched");

/** The slice of `FooterComponent` this patch needs. */
export interface StatusFooter {
  render(width: number): string[];
}

/** Shape of the footer's private data provider, if that field still exists. */
interface FooterStatusSource {
  getExtensionStatuses(): ReadonlyMap<string, string>;
}

/** `StatusFooter` widened with the private field the built-in footer carries. */
interface FooterWithStatusSource extends StatusFooter {
  footerData?: FooterStatusSource;
}

/**
 * The live `FooterComponent.prototype`, narrowed to the public member this
 * patch touches. `FooterComponent` is a package export, so this is the same
 * class object Pi's interactive mode instantiates.
 */
const footerPrototype: StatusFooter = FooterComponent.prototype;

/**
 * Read the footer's extension statuses without depending on the private field
 * name at compile time; a renamed or missing field degrades to "no statuses".
 */
function readExtensionStatuses(footer: StatusFooter): ReadonlyMap<string, string> | undefined {
  // SAFETY: FooterComponent stores its provider on the instance; the cast only
  // widens the structural view, and the field is feature-detected below.
  const source = (footer as FooterWithStatusSource).footerData;
  if (!source || typeof source.getExtensionStatuses !== "function") return undefined;
  return source.getExtensionStatuses();
}

/**
 * Replace the footer's trailing status line with a wrapped version.
 *
 * Pi's built-in footer joins every `ctx.ui.setStatus()` text into one line and
 * then truncates that line to the terminal width, so statuses silently
 * disappear on narrow terminals. The footer's leading lines (cwd, token stats,
 * model) are returned untouched; only the status line is re-laid-out.
 */
export function wrapFooterStatusLines(lines: string[], footer: StatusFooter, width: number): string[] {
  const statuses = readExtensionStatuses(footer);
  if (!statuses || statuses.size === 0) return lines;

  const items = orderStatusTexts(statuses);
  if (items.length === 0) return lines;

  // The built-in footer appends exactly one status line. A result with two or
  // fewer lines means the layout changed, so leave it alone rather than
  // inventing a line the built-in footer deliberately omitted.
  if (lines.length < 3) return lines;

  const head = lines.slice(0, -1);
  return [...head, ...packStatusLines(items, width)];
}

/**
 * Install the footer status wrap on a component prototype.
 *
 * Safe to call repeatedly: the marker makes later calls no-ops, so Pi reloads
 * cannot stack wrappers around each other.
 */
export function installFooterStatusWrap(proto: StatusFooter = footerPrototype): void {
  if (Object.prototype.hasOwnProperty.call(proto, PATCH_MARK)) return;

  const original = proto.render;

  const patched = function patchedFooterRender(this: StatusFooter, width: number): string[] {
    const lines = original.call(this, width);
    try {
      return wrapFooterStatusLines(lines, this, width);
    } catch {
      // A footer experiment must never be able to break rendering.
      return lines;
    }
  };

  Object.defineProperty(proto, "render", {
    value: patched,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  Object.defineProperty(proto, PATCH_MARK, {
    value: true,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
