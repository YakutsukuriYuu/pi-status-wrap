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

It also covers footers installed by **other extensions**. A footer that replaces
Pi's built-in one through `ctx.ui.setFooter()` (a Starship-style footer, for
example) owns its own layout and may drop statuses that do not fit its budget.
Those dropped statuses are appended below that footer's own output, so its
design is preserved and nothing goes missing.

## Install

```bash
pi install git:github.com/YakutsukuriYuu/pi-status-wrap
```

For local development, point Pi at the directory with `--extension`:

```bash
pi --extension ./index.ts
```

## How it works

Two patches, both installed when the extension loads — extension factories run
before any `session_start` handler, so both are in place before another
extension can install a footer.

**1. The built-in footer.** `FooterComponent` is a public export of
`@earendil-works/pi-coding-agent`, and Pi aliases that specifier so extensions
receive the **same module instance** Pi itself uses. That makes the footer
component safely reachable from an extension:

```ts
import { FooterComponent } from "@earendil-works/pi-coding-agent";

FooterComponent.prototype.render = function patched(width) {
  const lines = original.call(this, width);          // [cwd, stats, status]
  return [...lines.slice(0, -1), ...wrappedStatuses]; // replace the status line
};
```

**2. Replaced footers.** `InteractiveMode` is also a public export, so the
method behind `ctx.ui.setFooter()` can be wrapped:

```ts
const original = InteractiveMode.prototype.setExtensionFooter;
InteractiveMode.prototype.setExtensionFooter = function (factory) {
  if (typeof factory !== "function") return original.call(this, factory);
  return original.call(this, (tui, theme, footerData) =>
    wrapFooterComponent(factory(tui, theme, footerData), footerData),
  );
};
```

The wrapper renders the other extension's component unchanged, then appends any
status text that does not appear in its output. A status counts as shown when
its plain text appears inside one rendered line, so a footer that cut a status
short is treated as having dropped it.

Why patch instead of editing `dist/.../footer.js`:

| Approach | survives `pi` upgrade | keeps built-in footer logic |
| --- | --- | --- |
| edit `dist/modes/interactive/components/footer.js` | no | yes |
| fork / local install | yes | yes |
| **prototype patch (this extension)** | yes | yes |

Both patches are installed once per process. Global-registry symbols mark each
target, so `/reload` (or any repeated load) cannot stack wrappers.

## Deliberate design choices

- **Item-boundary packing.** Pi's own footer joins with `" "` and truncates; a
  naive `wrapTextWithAnsi` on the joined string would break a status in half.
  Here an item is moved to the next line whole.
- **Sanitized input.** Newlines/tabs in a status text are collapsed, mirroring
  Pi's own `sanitizeStatusText`, so an extension cannot inject extra footer rows
  that bypass the wrapper.
- **Graceful degradation.** If the private `footerData` field, its
  `getExtensionStatuses` method, the footer's line order, or
  `setExtensionFooter` ever changes, the affected patch returns the original
  lines untouched instead of breaking rendering.

## Caveats

- **Height, not width, becomes the limit.** Wrapped and appended lines still
  live inside Pi's bottom input dock, which shrinks on short terminals. The extra
  status lines come last, so on a very short terminal the *last* ones are clipped
  from the bottom. Put the statuses you care about first, or combine this with a
  top overlay if you need a guarantee.
- **Statuses may appear twice** if a footer shows a status in a form whose plain
  text still contains the full status text but is split across two of its lines;
  the check looks inside a single line and will then append the status again.
- **Depends on Pi's internals.** It reads the private `footerData` field, assumes
the built-in footer appends exactly one trailing status line, and patches the
private `setExtensionFooter` method. None of this is a documented API; the
fallbacks keep it harmless when the shape changes.
- Status text is no longer dimmed in the built-in footer. Pi wraps the status
  line in `theme.fg("dim")`; wrapping per line would require the footer's theme,
  and most statuses carry their own colors anyway.

## Development

```bash
npm install
npm run check      # tsc --noEmit && node --test
```

```text
src/wrap.ts          status ordering, sanitizing, item-boundary packing,
                     "what did this footer fail to show"
src/footer-patch.ts  built-in FooterComponent patch
                     + custom-footer (setExtensionFooter) patch
tests/               unit + integration tests
```
