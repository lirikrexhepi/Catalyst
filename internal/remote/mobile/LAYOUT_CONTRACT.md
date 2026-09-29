# Phone layout contract — read before touching the composer, dock, shell, or service worker

On 29 Sep 2026 the chat input sat ~100 CSS px above the screen bottom (measured
from a device screenshot: pill bottom at ~830 CSS px on a 932 px tall screen).
Only ~34 px of that was the iPhone home-indicator safe area. The rest was two
real bugs, fixed in `5144dd7` (single-row composer) and `8c095d0` (shell height).
Do not reintroduce them.

## 1. Composer is single-row

`Composer.tsx` lays out attach, textarea, mic and send/stop side by side in one
`.composer-surface` pill (`flex-direction: row`, `align-items: flex-end`).
Never stack the textarea above a button row again: that alone puts ~52 px of
dead space under the text field (button row) plus the safe-area gap, which is
exactly the "80-100 px unused at the bottom" complaint.

## 2. Shell height: only trust visualViewport while the keyboard is open

`platform/viewport.ts` sets `--app-h` to `visualViewport.height` ONLY when the
keyboard-open heuristic fires (`resting - vv.height > 120`). Keyboard closed,
`--app-h` is removed and `.shell` falls back to `100dvh` (`index.css` keeps a
`100%` first line for browsers without `dvh` support).

Background: the shell used to pin `--app-h` to the last visualViewport value at
all times. When that value went stale the whole chat rendered ~66 px short of
the screen bottom and nothing corrected it while the keyboard stayed closed.
Do not write `--app-h` unconditionally again.

`--app-y` (from `vv.offsetTop`) is still always written; the keyboard glide
animations keyed on `data-kb-follow` are unchanged.

## 3. Textarea growth must never collapse to measure

`grow()` in `Composer.tsx` takes the grow path (set the larger height directly,
CSS `transition: height 200ms ease-out` glides it) and only resets to
`height = auto` when content SHRANK. Resetting to `auto` on every keystroke
makes voice dictation visibly flicker. Textarea default `min-height` is 40 px.

## 4. Service-worker cache version is stamped at build time

`public/sw.js` contains the placeholder `__BUILD_HASH__`, replaced with the
build commit by `scripts/stamp-sw.js` (runs as the last step of `npm run build`).
Every build therefore ships a new `CACHE` name, so iOS detects a worker update
on the next PWA launch, precaches the fresh shell, and `main.tsx`
(`reloadWhenIdle`) reloads only when no agent is busy.

Never hardcode the cache name again (e.g. `orchestrator-shell-v2`): builds that
don't change `sw.js` bytes are invisible to iOS, the precache goes stale, cold
launches blow past the 4 s network timeout, and the only recovery is deleting
and re-adding the home-screen app. That is what happened before this rule.

`main.tsx` also calls `reg.update()` on load and on every foregrounding, and
defers the `controllerchange` reload while any summary in
`orchestrator_summaries_cache` is busy. Keep both.
