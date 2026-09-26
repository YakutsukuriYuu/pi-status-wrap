import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installCustomFooterWrap, installFooterStatusWrap } from "./src/footer-patch.ts";

/**
 * pi-status-wrap
 *
 * Pi's built-in footer joins every extension status (`ctx.ui.setStatus()`) into
 * a single line and truncates it to the terminal width, so statuses on the
 * right — token speed, ssh, mcp, … — silently vanish on narrow terminals.
 *
 * Two patches keep them visible:
 *
 * 1. `FooterComponent.prototype.render` wraps the built-in status line instead
 *    of truncating it.
 * 2. `InteractiveMode.setExtensionFooter` covers extensions that replace the
 *    footer entirely (`ctx.ui.setFooter()`), which would otherwise leave patch
 *    1 inert. Statuses such a footer dropped are appended below its output.
 *
 * Everything else about the footer — its own layout, colours, and the built-in
 * cwd/stats/model lines — is left exactly as it ships.
 */
export default function (_pi: ExtensionAPI): void {
  installFooterStatusWrap();
  installCustomFooterWrap();
}
