# pi-status-wrap

Keep every footer status readable on narrow terminals.

## The problem

Pi's built-in footer joins all `ctx.ui.setStatus()` texts into a **single line**
and then truncates it to the terminal width:

```text
1 server enabled (1 connected) SSH: Connected ⚡ TPS: 42.0 tok…   ← cut off
```

The rightmost statuses (token speed, ssh, mcp, …) silently disappear as soon as
the terminal gets narrow, and there is no built-in setting to change that.

## What this does

It wraps that status line into **as many lines as it needs**, instead of cutting
it:

```text
1 server enabled (1 connected)
SSH: Connected
⚡ TPS: 42.0 tok/s
```

Everything else about the footer — cwd/branch/session line, token stats,
model + thinking level, context percentage, auto-compact indicator — is left
exactly as Pi ships it.

Status items are packed at **item boundaries**, so a status is never split
across two lines if it can fit on one. Only a single item wider than the whole
terminal is hard-wrapped, and that wrap is ANSI-aware (styling survives).

## Install

As a Pi package:

```bash
pi packages add /absolute/path/to/pi-status-wrap
```

or from git/npm once published.

For local development, point Pi at the directory with `--extension`:

```bash
pi --extension ./index.ts
```

## How it works

`FooterComponent` is a public export of `@earendil-works/pi-coding-agent`, and
Pi aliases that specifier so extensions receive the **same module instance** Pi
itself uses. That makes the footer component safely reachable from an extension:

```ts
import { FooterComponent } from "@earendil-works/pi-coding-agent";

FooterComponent.prototype.render = function patched(width) {
  const lines = original.call(this, width);          // [cwd, stats, status]
  return [...lines.slice(0, -1), ...wrappedStatuses]; // replace the status line
};
```

Why patch the prototype instead of editing `dist/.../footer.js`:

| Approach | survives `pi` upgrade | keeps built-in footer logic |
|---|---|---|
| edit `dist/modes/interactive/components/footer.js` | no | yes |
| fork / local install | yes | yes |
| **prototype patch (this extension)** | yes | yes |

The patch is installed once per process. A global-registry symbol marks the
prototype, so `/reload` (or any repeated load) cannot stack wrappers.

## Deliberate design choices

- **Item-boundary packing.** Pi's own footer joins with `" "` and truncates; a
  naive `wrapTextWithAnsi` on the joined string would break a status in half.
  Here an item is moved to the next line whole.
- **Sanitized input.** Newlines/tabs in a status text are collapsed, mirroring
  Pi's own `sanitizeStatusText`, so an extension cannot inject extra footer rows
  that bypass the wrapper.
- **Graceful degradation.** If the private `footerData` field, its
  `getExtensionStatuses` method, or the footer's line order ever changes, the
  patch returns the original lines untouched instead of breaking rendering.

## Caveats

- **Height, not width, becomes the limit.** Wrapped lines still live inside Pi's
  bottom input dock, which shrinks on short terminals. The extra status lines are
  appended after the stats line, so on a very short terminal the *last* ones are
  clipped from the bottom. Put the statuses you care about first, or combine this
  with a top overlay if you need a guarantee.
- **Inert if another extension replaces the footer.** If something calls
  `ctx.ui.setFooter()`, the built-in `FooterComponent` is not rendered at all and
  this patch has nothing to act on.
- **Depends on Pi's internals.** It reads the private `footerData` field and
  assumes the built-in footer appends exactly one trailing status line. This is
  not a documented API; the fallback keeps it harmless when the shape changes.
- Status text is no longer dimmed. Pi wraps the status line in `theme.fg("dim")`;
  wrapping per line would require the footer's theme, and most statuses carry
  their own colors anyway.

## Development

```bash
npm install
npm run check      # tsc --noEmit && node --test
```

```text
src/wrap.ts          status ordering, sanitizing, item-boundary packing
src/footer-patch.ts  FooterComponent.prototype.render patch
tests/               unit tests for both
```
