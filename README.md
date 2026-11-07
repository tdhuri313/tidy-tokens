# Tidy Tokens

[![CI](https://github.com/tdhuri313/tidy-tokens/actions/workflows/ci.yml/badge.svg)](https://github.com/tdhuri313/tidy-tokens/actions/workflows/ci.yml)

Find and fix design-system drift in Figma, in one click.

**Figma Community:** _link coming soon_

<!-- Demo GIF: replace with ![Tidy Tokens demo](docs/demo.gif) -->
_Demo GIF coming soon_

## Why I built it

In design ops at Visa, files drifted from the design system as designers hardcoded colors, nudged spacing off-grid, and skipped text styles. Reviews caught some of it by hand, and engineers inherited the rest.

## What it checks

| Rule | Flags | Fix |
|---|---|---|
| Hardcoded color | A solid fill or stroke that isn't bound to a variable or style | Binds the nearest color token if it's under Delta E 5 |
| Off-grid spacing | Auto-layout padding or item spacing that isn't a multiple of the grid (4px or 8px) | Rounds to the nearest grid value |
| Low contrast | Text below WCAG AA (4.5:1, or 3:1 for large text) against its background | Suggests the nearest token that passes. Never auto-applied |
| Text style | A text layer with no text style | Applies a close match in the same font family (within 1px and one weight step) |

Every issue is listed by rule. Click one to select and zoom to the layer, click **Fix** for one, or **Fix all** for a whole section or the whole file.

## How it works

- **Two halves.** A Figma plugin runs as a main thread (`src/main`, which can use the Figma API but has no DOM) and a UI iframe (`ui.html`, which has a DOM but no Figma API). They talk only through `postMessage`: the UI sends `scan`, `fix`, `select`, and `cancel`. The main thread replies with `progress`, `results`, and errors.
- **A pure engine.** The main thread turns each layer into a plain `Snapshot` object. The rules in `src/core` read only snapshots, never the Figma API, so they're plain functions that are fully unit-tested.
- **Color pipeline.** sRGB → linear RGB → XYZ (D65) → CIELAB → Delta E. A hardcoded color matches a token when the Delta E between them is under the threshold (5 by default, adjustable from 1 to 20 in settings).
- **Contrast.** WCAG relative luminance and contrast ratio. A semi-transparent text fill is first blended with the background behind it, so the ratio matches what's actually drawn.

## Key decisions

- **Lab and Delta E, not RGB distance.** Equal steps in RGB don't look equal to people, so RGB distance overrates some differences and underrates others. Distance in Lab is designed to track how different two colors look, so "under Delta E 5" means "looks almost the same."
- **Contrast fixes are suggestions.** Changing text color changes the design's intent, and the nearest passing token may not suit the brand. The designer decides.
- **Distant text style matches aren't auto-applied.** Applying a style that's several pixels or weights off would visibly change the layout. Close matches get a Fix button. Distant ones show the nearest style as a suggestion.
- **The score is null when there's nothing to check.** A scope with no colors, auto layout, or text would score 100% by default, which would be misleading. The panel says "Nothing to check" instead.
- **Batching keeps Figma responsive.** Scans build snapshots in batches of 500 and run rules in batches of 1,000. Fix all applies 200 fixes at a time. Each batch yields back to Figma, so the canvas and progress bar stay live and Cancel works. Fix all still calls `commitUndo()` once at the end, so it's one undo step.

## Performance

| Layers | Before batching | After batching |
|---|---|---|
| 468 | 271ms (froze UI) | — |
| 4,654 | 2,852ms (froze UI) | — |
| ~20,000 | not measured | [MY 20K TIME]ms, responsive |

The "after" numbers for the smaller files will be added later.

## Tests and CI

- 74 unit tests (Vitest) cover the `src/core` engine, with 100% line coverage (`npm run coverage`).
- Every push and pull request to `main` runs typecheck, lint, tests, and build on GitHub Actions.
- The Figma-side behavior is checked by hand with the checklist in [TESTING.md](TESTING.md).

## Run it locally

```sh
git clone https://github.com/tdhuri313/tidy-tokens.git
cd tidy-tokens
npm install
npm run watch
```

Then in the Figma desktop app, go to **Plugins → Development → Import plugin from manifest…** and choose `manifest.json`.

There are two plugins in `dev/` for testing:

- `dev/seed-test-file` builds a frame with one of each planted mistake.
- `dev/stress-test` copies that frame into a 500, 5,000, or 20,000-layer page.

[TESTING.md](TESTING.md) explains how to use them.

## What's next

- Delta E 2000 (CIEDE2000) in place of Delta E 76, for more accurate matches in blues and grays
- Flag detached components
- Team config files for grid size, thresholds, and which rules to run
- Lint exported design tokens in CI, outside Figma

## License

[MIT](LICENSE)
