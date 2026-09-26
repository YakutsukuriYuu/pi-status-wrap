import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installFooterStatusWrap } from "./src/footer-patch.ts";

/**
 * pi-status-wrap
 *
 * Pi's built-in footer joins every extension status (`ctx.ui.setStatus()`) into
 * a single line and truncates it to the terminal width, so statuses on the
 * right — token speed, ssh, mcp, … — silently vanish on narrow terminals.
 *
 * This extension patches `FooterComponent.prototype.render` so that status line
 * wraps into as many lines as it needs instead of being cut. The footer's
 * leading lines (cwd, token stats, model) and every other footer behaviour are
 * left exactly as Pi ships them.
 */
export default function (_pi: ExtensionAPI): void {
  installFooterStatusWrap();
}
