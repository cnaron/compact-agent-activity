# Optimization log — 2026-09-15

A record of a debugging session that fixed several image and spacing bugs
in the compact activity feed. Kept for context on *why* the code looks the
way it does — several fixes look odd in isolation but exist to work around
specific host behavior discovered the hard way below.

## What changed

1. **Image thumbnails no longer render near full natural height.**
   `client/image-sizer.ts` only capped width (`max-width: 440px`); a tall
   portrait screenshot (e.g. a full phone capture) kept its full natural
   aspect ratio, rendering 800–1000px tall inline. Fixed by fitting both
   axes into a `440×320` bounding box (`Math.min(maxW/nw, maxH/nh, 1)`)
   instead of a width-only scale.

2. **The image's clickable card wasn't capped at all.** The card wrapping
   the thumbnail renders as an actual `<button>` element in this host, but
   the compaction CSS was scoped to `div[role="button"]`. A `<button>` tag
   never matches a `div[...]` type selector, so the card (which can also
   contain a long inline text/OCR preview under the thumbnail) rendered at
   its full, unclamped content height. Fixed by dropping the `div` type
   qualifier so the selectors match any element carrying `role="button"`.

3. **The fullscreen image viewer (lightbox) turned solid black.** The same
   compaction rules are global (`[role="img"]`, `[role="button"]`, no
   scoping) and also matched elements *inside* the fullscreen preview
   (`[data-testid="attachment-lightbox"]`, `role="dialog"`), which reuses
   the same `role="img"`/`role="button"` markup. Forcing `min-height: 0`
   and `flex-start` alignment there collapsed the viewer's centering
   container to zero height, leaving only its own opaque black backdrop
   visible. Fixed by adding `:not([role="dialog"] *):not([data-testid="attachment-lightbox"] *)`
   to every thumbnail-compaction selector, excluding the lightbox at the
   selector level instead of trying to out-specificity it after the fact.

4. **Folded activity row spacing didn't respond to any CSS/margin change.**
   The row-to-row tightening set a `data-folded-wrapper` attribute (via a
   `useIsomorphicLayoutEffect`) and margin on `el.parentElement`. That
   parent is frequently a `display: contents` wrapper — an element that
   generates no box, so `margin`/`padding`/`border` on it are silently
   ignored per spec. Every spacing tweak against that element was a no-op,
   which is why increasingly aggressive values (`-6px` → `-24px` → `-45px`)
   kept "doing nothing" until they suddenly overshot into visible overlap.
   Fixed by applying margin to the row itself (`containerRef.current`,
   which *does* generate a real box), and detecting adjacency by walking
   document order (previous sibling → its deepest last descendant) instead
   of a CSS `+`/`:has()` sibling selector, since the real list container
   sits several `display: contents` / single-child levels above where the
   row lives — CSS sibling combinators never had a chance to see two rows
   as adjacent at any shallow nesting level.

5. **Removed the spinner next to a running folded row.** The
   `ActivityIndicator` shown beside a folded summary while its tool calls
   were still in flight read as anxious for what's meant to be a calm
   background status line. Removed, along with the now-dead
   `isRunning`/`isTurnFinished`/`useAgent` plumbing that only fed it.

## Still open

- **Image card left margin.** The thumbnail card sits with a large gap
  from the left edge of the message column instead of flush-left. Two
  rounds of investigation didn't land it:
  - First pass found the card's own computed style already correct
    (`align-self: flex-start`, `margin-left: 0`) — the offset comes from
    something higher up the tree, not the card itself.
  - Second pass (after the `display: contents` discovery above) got as
    far as wiring a click-diagnostic that dumps `paddingLeft` up the
    ancestor chain, but never got a click captured before the session
    moved on to the spacing issue.
  - Next attempt should reuse the diagnostic technique below and check
    `paddingLeft`/`position: relative; left: …` on ancestors, not just
    margin — the `display: contents` pattern means "the property you
    expect to be doing this is a no-op on the element you're looking at"
    is a real recurring failure mode in this host, not a one-off.

- **Folded-row-to-prose spacing is asymmetric.** The document-order walk
  in `activity.tsx` only looks *backward* (what precedes this row), which
  is reliable because everything before a row is already mounted when it
  first renders. Looking *forward* (what follows) is not reliable at
  mount time in a streaming UI — a later-arriving sibling won't retroactively
  fix an earlier row's margin — so "a folded row immediately followed by
  prose" still uses the host's untouched default gap. Fixing that
  properly needs either a mutation-observed re-check or accepting the
  asymmetry.

## Diagnostic technique: production DevTools is disabled

The distributed Paseo desktop app (`/Applications/Paseo.app`, Electron)
ships with DevTools hard-disabled — no menu item, no `⌥⌘I`, confirmed by
extracting `app.asar` and finding `{ role: "toggleDevTools" }` registered
in the Electron menu but never reachable at runtime. Live DOM inspection
is not available on this build.

The technique that actually worked, repeatedly, this session:

1. Add a scratch `defineRpc` contract in `shared/` (name must match
   `/^[a-z][a-z0-9._-]*$/` — lowercase only, or the plugin fails to load).
2. Handle it in `index.server.ts` with a plain `console.log`.
3. In `index.client.tsx`, call the RPC from a client-side scan/click
   listener that walks `document`, dumping `getBoundingClientRect()` +
   `getComputedStyle()` for whatever's under investigation.
4. `paseo plugin reload <id>`, trigger the interaction in the running app,
   then `paseo plugin logs <id>` to read the dump — this is the only
   window into the live renderer's real DOM/computed style on this build.
5. **Delete the scratch RPC/diagnostic files before committing.** They
   should never ship; every round in this session that added one also
   removed it in the same or a follow-up turn once the answer was in hand.

Filtering matters: a broad `document.querySelectorAll('*')` scan mostly
returns generic full-height flex chrome (the whole window's shell) unless
you filter on `getBoundingClientRect().height > 0` first — off-screen
virtualized items and pre-measurement copies report `0×0` and will
otherwise drown out the element you actually want.

## Working with this plugin during development

- **Source-directory installs don't hot-reload.** `paseo plugin ls` shows
  `SOURCE: directory` pointing at this repo; editing files takes no effect
  until `paseo plugin reload compact-agent-activity` runs (per-plugin,
  not a daemon restart). This is easy to forget and looks identical to
  "the fix didn't work."
- Always `npm run typecheck && npx vitest run` before every reload —
  both are fast (<1s) and catch the regression before it reaches the
  running app.
- `paseo plugin logs <id>` tail is capped (~500 lines); a busy diagnostic
  loop pushes real output out of the window within seconds. Keep scratch
  logging terse, or write it to a file via a redirect and `grep`/`Read`
  that instead of relying on the live tail.
