# Manual testing

The unit tests cover `src/core`. Everything that touches the Figma API (finding layers, applying fixes, the UI) needs to be checked by hand in the Figma desktop app before each release.

## Setup

1. Run `npm install`, then `npm run build` (or keep `npm run watch` running).
2. In the Figma desktop app, open a blank design file.
3. Go to **Plugins → Development → Import plugin from manifest…** and import each of these:
   - `manifest.json` (Tidy Tokens)
   - `dev/seed-test-file/manifest.json` (Tidy Tokens Test Seed)
   - `dev/stress-test/manifest.json` (Tidy Tokens Stress Test)

### Seed plugin

**Plugins → Development → Tidy Tokens Test Seed** builds a frame called "Tidy Tokens Seed" on the current page. It also creates the "Tidy Test Tokens" color variables (Purple, Navy, Lavender, White) and a "Body" text style (Inter Regular 16). Running it again reuses the tokens and rebuilds the frame.

With the default 8px grid and Delta E 5, a scan of the seed frame should show these 8 planted mistakes:

| Layer | Rule | Expected |
|---|---|---|
| Color close | Hardcoded color | `#665EFF` matches Purple, with a Fix button |
| Color far | Hardcoded color | `#00C853` has no close token, so no Fix button |
| Spacing bad | Off-grid spacing | 4 issues: top 13 → 16, right 22 → 24, bottom 13 → 16, left 22 → 24 |
| Text low contrast | Low contrast | Lavender on White fails 4.5:1 and suggests a passing token, with no Fix button |
| Text no style | Text style | Applies Body, with a Fix button |

Color bound, Spacing good, and Text clean should not be flagged.

### Stress test plugin

Run the seed plugin first, then stay on that page and choose **Plugins → Development → Tidy Tokens Stress Test → 500 / 5,000 / 20,000 layers**. It fills a page called "Stress <size>" with copies of the seed frame and switches to it. Running it again clears and refills that page.

## Checklist

- [ ] **Every planted mistake is flagged.** Scan the seed page and compare the results to the table above.
- [ ] **Clicking an issue selects and zooms to the layer.** Also try a layer on another page (All pages scope): Figma should switch pages. Delete a layer, then click its issue: the panel should say the layer no longer exists.
- [ ] **Fix works.** Click Fix on one issue. The rescan should no longer show it, and the status should say "Fixed 1".
- [ ] **Fix all works, and one Ctrl+Z (Cmd+Z on Mac) undoes it.** Click the top Fix all, then press undo once in Figma. Every fixed layer should go back, and a rescan should show the original issues again.
- [ ] **Selection scope works.** Select only "Color close" and scan: there should be 1 issue. Deselect everything and scan: the panel should say "Select at least one layer, or switch scope."
- [ ] **Current page scope works.** Only layers on the current page are listed.
- [ ] **All pages scope works.** Issues from the seed page and any stress pages are all listed.
- [ ] **A file with no tokens shows the empty state.** In a new file with no color variables or styles, draw a rectangle with a solid fill and scan. The panel should show "No color tokens found in this file", and the hardcoded color issue should still be listed (without a Fix button).
- [ ] **A 20,000-layer page scans without freezing.** Make the 20,000-layer stress page and scan it. The progress bar should move through "Reading layers" and "Checking rules", and Figma should stay responsive (the canvas can still pan) during the scan. Note the total time from the console line that starts with "Tidy Tokens scan:".
- [ ] **A scan can be cancelled.** Start the 20,000-layer scan again and click Cancel. The panel should say the scan was cancelled, and the Scan button should work again.
