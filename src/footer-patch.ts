import { FooterComponent, InteractiveMode } from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { appendMissingStatuses, orderStatusTexts, packStatusLines } from "./wrap.ts";

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

/** A footer component, as returned by a `ctx.ui.setFooter()` factory. */
export type FooterLike = Component & { dispose?(): void };

/** Factory argument of `ctx.ui.setFooter()`, i.e. what `setExtensionFooter` takes. */
type FooterFactoryArg = Parameters<ExtensionUIContext["setFooter"]>[0];

/** Host slice that installs custom footers. */
export interface CustomFooterHost {
  setExtensionFooter(factory: FooterFactoryArg): void;
}

/** Marker for the custom-footer patch, separate from the built-in footer mark. */
const CUSTOM_FOOTER_MARK = Symbol.for("pi-status-wrap/custom-footer");

// SAFETY: `setExtensionFooter` is private in InteractiveMode's declarations but
// exists on the runtime prototype; CustomFooterHost is exactly that slice.
const interactiveModePrototype = InteractiveMode.prototype as unknown as CustomFooterHost;

/**
 * Wrap a custom footer so statuses it dropped still appear.
 *
 * Extensions that call `ctx.ui.setFooter()` (a "starship"-style footer, for
 * example) replace Pi's built-in footer, which makes the prototype patch above
 * inert. Such a footer owns its own layout and may silently drop status texts
 * that do not fit its budget. Appending whatever it did not render keeps every
 * status on screen without touching the footer's own design.
 */
export function wrapFooterComponent(
  component: FooterLike,
  getStatuses: () => ReadonlyMap<string, string> | undefined,
): FooterLike {
  return {
    render(width: number): string[] {
      const lines = component.render(width);
      try {
        const statuses = getStatuses();
        if (!statuses || statuses.size === 0) return lines;
        return appendMissingStatuses(lines, statuses, width);
      } catch {
        // A footer experiment must never be able to break rendering.
        return lines;
      }
    },
    invalidate(): void {
      component.invalidate();
    },
    dispose(): void {
      component.dispose?.();
    },
  };
}

/**
 * Wrap `InteractiveMode.setExtensionFooter` so custom footers are covered too.
 *
 * Extension factories run before any `session_start` handler, so installing
 * this at load time guarantees the hook is in place before another extension
 * can install its footer.
 */
export function installCustomFooterWrap(host: CustomFooterHost = interactiveModePrototype): void {
  if (Object.prototype.hasOwnProperty.call(host, CUSTOM_FOOTER_MARK)) return;

  const original = host.setExtensionFooter;

  host.setExtensionFooter = function patchedSetExtensionFooter(
    this: CustomFooterHost,
    factory: FooterFactoryArg,
  ): void {
    if (typeof factory !== "function") {
      original.call(this, factory);
      return;
    }

    let provider: ReadonlyFooterDataProvider | undefined;

    original.call(this, (tui, theme, footerData) => {
      provider = footerData;
      const component = factory(tui, theme, footerData);
      return wrapFooterComponent(component, () => provider?.getExtensionStatuses());
    });
  };

  Object.defineProperty(host, CUSTOM_FOOTER_MARK, {
    value: true,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
