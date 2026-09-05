# Design QA — Surf Radar

## Visual source

- Baseline: the currently published GitHub Pages version at `https://sydsil.github.io/surf-radar/#forecast`.
- Mobile reference: `github-current-reference-mobile.png` at 390 × 844.
- The implementation keeps the published version's white/aqua surface, navy typography, teal actions, thin separators, compact watched-spot rows, logo, bottom navigation, spacing rhythm and restrained radii.
- The required best-spot hero intentionally changes the content hierarchy while preserving that existing visual language.

## Comparison

- Combined source/implementation comparison: `github-ui-final-comparison.png`.
- Final multi-spot mobile state: `github-ui-final-mobile-clean.png` at 390 × 844.
- Final desktop state: `github-ui-final-desktop.png` at 1440 × 1000.
- Detailed bottom sheet: `github-ui-spot-sheet-mobile.png` at 390 × 844.
- After review, the multi-spot control was simplified to dots only: inactive dots are grey, the active dot is teal, and arrows plus numeric counters were removed.

## Visual checks

- Typography, logo scale, teal/navy palette and thin divider treatment match the GitHub baseline.
- The best spot remains prominent without introducing the rejected dark/card-heavy visual direction.
- Five conditions fit on one mobile row without overlap.
- Primary Google Maps action and the two secondary actions keep a clear hierarchy.
- Watched spots remain compact and expose only quality, next time, swell height and period.
- The bottom sheet uses a real local photo with visible attribution when verified; spots without a verified photo render no image block.
- Mobile fixed navigation does not cover the primary actions. Desktop keeps the existing left navigation and wide content rhythm.

## Interaction checks

- Multi-spot carousel: horizontal movement and clickable dots update `aria-current`; verified from the first to the second spot.
- No arrows or `1 / n` counter remain in markup or CSS.
- Google Maps links include destination coordinates and driving mode for hero, watched rows and detail sheet.
- Agenda action generates an `.ics` event containing the spot, address, important conditions, Google Maps link and two alarms.
- Reminder logic selects the previous-day reminder when possible and falls back to an agenda reminder when browser notifications are unavailable or refused.
- Watched-spot rows open the bottom sheet. Siouville loads `assets/spots/siouville.jpg`, its Wikimedia credit and the verified Cotentin Surf Club webcam.
- Vluchtenburg has no verified photo and renders no photo element.
- Navigation, profile form and spot settings were exercised in the in-app browser.
- Browser console logs: no errors.

## Automated checks

- `node --check`: `app.js`, `session-calendar.js`, `sw.js` passed.
- `npm test`: 45 tests passed, 0 failed.
- `git diff --check`: passed; only Windows line-ending notices were reported.

## Result

## Spots map follow-up

- Published Spots view and updated implementation were captured at the same desktop viewport and combined in `spots-map-before-after-wide.png`.
- Mobile map view was verified at 390 × 844 in `spots-map-mobile-v2.png`.
- Desktop map view was verified at 1440 × 1000 in `spots-map-desktop-top.png`.
- Four valid saved coordinates produce four Leaflet markers; overlapping Cotentin markers separate naturally when zooming.
- Marker popup was exercised and exposes the spot name, travel time and a Google Maps driving route.
- The circular `?` trigger opens and closes the Android sharing help; the open mobile state was captured in `spots-map-help-mobile.png`.
- The map is recreated safely across forecast-driven rerenders and route changes; a fresh browser check reported no console errors.
- Motion is limited to a 160 ms origin-aware help popover entrance and the existing reduced-motion fallback.
- `npm test`: 42 tests passed, 0 failed after the map follow-up.

## CTA, Google Maps import and motion follow-up

- The previous Spots implementation and the updated build were captured at the same 1267 × 712 viewport, combined in `cta-motion-before-after-wide.png` and reviewed together.
- All controls using the shared CTA component now have a true pill silhouette (`999px` radius). Cards, form fields, navigation rows and map controls keep their existing geometry.
- Mobile Spots was verified at 390 × 844 in `cta-motion-spots-mobile.png`; the desktop state is in `cta-motion-spots-desktop.png`.
- The former raw import button now opens a focused Google Maps import sheet. It explains Android sharing and whole-list Google Takeout import without suggesting an unavailable private-list sync.
- Import sheet states were verified on mobile and desktop in `cta-motion-google-import-mobile.png` and `cta-motion-google-import-desktop.png`.
- Motion uses shared timing and easing tokens: short press feedback, restrained route entrance, modal/sheet entrance, animated close and toast movement. It only animates opacity and transforms.
- `prefers-reduced-motion` keeps all motion effectively disabled, including the new modal and sheet transitions.
- Modal close controls, backdrop close and Escape close use the same animated close path. The file chooser remains directly triggered by the user action.
- Fresh browser console check after desktop/mobile route and dialog testing: no application errors.
- `node --check`: `app.js`, `session-calendar.js`, `sw.js` passed.
- `npm test`: 45 tests passed, 0 failed.
- `npm run build`: static build completed successfully.
- `git diff --check`: passed; only Windows line-ending notices were reported.

## Spots hierarchy and dismissible sheets follow-up

### Evidence

- Source visual truth: `map-hierarchy-before-desktop.png` at 1267 × 712 and `map-hierarchy-before-mobile.png` at 390 × 844.
- Implementation: `map-hierarchy-after-desktop-final.png` at 1267 × 712 and `map-hierarchy-after-mobile-v1.png` at 390 × 844.
- Modal source and implementation: `modal-before-mobile.png` and `modal-after-mobile-final-v2.png`, both 390 × 844.
- CSS viewport and captured pixels match 1:1 at device scale 1; no density normalization was required.
- Full-view comparisons: `map-hierarchy-before-after-wide.png` and `map-hierarchy-before-after-mobile.png`.
- Focused modal comparison: `modal-before-after-mobile.png`; this was required because the close affordance and drag handle were too small to judge in the full-page comparison.
- States checked: Spots default view with ten saved markers, add-spot sheet open, background dismissal and swipe dismissal.

### Comparison history

- Earlier P1: three competing actions above the map obscured the primary task. Fixed by removing the Spots-page toolbar and placing a single `Ajouter` action inside the map tile.
- Earlier P2: the overview map looked secondary and exposed too little useful area. Fixed with a 480–620 px responsive desktop height, a 430 px mobile height, stronger map-container elevation and tighter page copy.
- Earlier P2: circular close buttons consumed visual space and the sheets only had explicit button dismissal. Fixed with an unboxed corner cross, a mobile drag handle, swipe-down dismissal, backdrop dismissal and the existing Escape path.
- Post-fix evidence: all three combined comparisons show the new hierarchy and lighter modal treatment. No actionable P0/P1/P2 issue remains.

### Fidelity surfaces

- Typography: the existing family, weights, headline hierarchy and antialiasing remain unchanged; the shorter page copy wraps cleanly at both target widths.
- Spacing and layout: the map now owns the main visual area, while `Ajouter` and the help icon form one compact control group without crowding the title.
- Colors and tokens: navy, teal, aqua, border and shadow tokens remain consistent with the accepted GitHub visual direction.
- Image quality: real OpenStreetMap tiles and Leaflet markers remain sharp and uncropped; no placeholder or generated map asset was introduced.
- Copy: duplicate `Spots connus`, `Carte / recherche` and direct Google-import actions were removed from the page. Google list import remains reachable from the add-spot sheet.

### Interaction and accessibility checks

- All ten saved spots remain present in the list and on the overview map.
- Background click was exercised outside the add sheet and closed it after the exit motion.
- A real 261 px downward drag from the sheet handle was exercised at 390 × 844 and closed the sheet.
- The close control measures 40 px but is absolutely positioned, so it no longer takes layout space; it keeps an accessible `Fermer` name and a visible teal focus color.
- Reduced-motion rules still collapse transition and animation durations.
- Fresh browser console check: no application errors.
- `npm test`: 47 tests passed, 0 failed.
- `npm run build`: static build completed successfully.
- `git diff --check`: passed; only Windows line-ending notices were reported.

## Active analysis and paused spots follow-up

- The former destructive `Retirer` action has been replaced on every spot card by a labelled `Analyse active` switch.
- Toggling a spot off was exercised in the in-app browser: it moved from `Spots analysés` to the bottom `Spots en pause` section without losing its route or settings.
- The same toggle was exercised in reverse and restored the spot to the analyzed list immediately.
- Active map markers render with the existing teal brand color; paused markers use a quiet neutral gray. The map heading exposes both counts and a compact legend.
- With one spot paused, the map reported nine analyzed markers and one paused marker. The paused spot had no heading in the Radar recommendations.
- Permanent deletion is no longer visible on the card. It remains available inside the expanded spot settings with explicit irreversible wording.
- The all-paused Radar state now directs the user to reactivate a saved spot instead of treating the collection as empty.
- Mobile cards, the paused section and advanced settings were inspected at the live 375 px viewport. The switch remains labelled and reachable without crowding the primary route action.
- Fresh browser console check: no application errors or warnings.
- `npm test`: 50 tests passed, 0 failed.
- `npm run build`: static build completed successfully.
- `git diff --check`: passed; only Windows line-ending notices were reported.

## Compact toggle and card safe-area correction

- The initial card treatment was captured in `audit/01-before-card-proportions.png`. Visible toggle copy overlapped long titles and the reserved grid column narrowed the entire card body.
- The corrected state was captured in `audit/02-after-card-proportions.png` at the same live browser width.
- `Analyse active`, `Dans le Radar` and equivalent status copy no longer render on spot cards or marker popups.
- The accessible switch name remains available to keyboard and assistive-technology users.
- Only the title row now shares space with the 44 px toggle. Metadata and notes recover the full content width.
- At the tested narrow viewport, `S’y rendre`, `Référence` and `Régler` remain on one row inside the card padding.
- Toggle-off and toggle-on were both exercised after the layout change; the spot moved between sections and returned without losing state.
- Fresh browser console check: no application errors or warnings.
- `npm test`: 50 tests passed, 0 failed.
- `npm run build`: static build completed successfully.

## Map tile mobile safety correction

- The crowded state was captured at 321 px in `audit/03-before-map-tile-safety.png`.
- The corrected default tile is in `audit/04-after-map-tile-safety.png`; its copy now uses the full row and its controls use a separate protected row.
- The Add action fills the available control width while the help button keeps a 44 px touch target.
- The open help state is in `audit/05-after-map-help-safety.png`; its width is constrained to preserve the mobile viewport inset.
- Map height, markers, legend, spot counts and existing desktop layout remain unchanged.
- Fresh browser console check: no application errors or warnings.
- `npm test`: 50 tests passed, 0 failed.
- `npm run build`: static build completed successfully.

## Map marker visibility correction

- The missing-marker state was reproduced in the live 321 px browser: Leaflet created all ten marker buttons, but the requested `ph-map-pin-fill` glyph did not exist in the bundled Phosphor icon font.
- The initial fallback to the available `ph-map-pin` glyph restored the markers but remained too visually light. It has been replaced by a fully filled marker silhouette based on Leaflet's bundled marker asset.
- Marker bodies are now solid rather than outlined, with stronger drop-shadow contrast and a small white center point that keeps the location-pin shape legible. Analyzed spots stay teal and paused spots stay neutral gray in both the map and its legend.
- The final filled-marker implementation is captured in `audit/17-final-filled-markers.png`; the mixed nine-analyzed / one-paused verification state was also exercised before restoring the saved state.
- The temporary paused-state check was reversed after capture, restoring the user state to ten analyzed spots and zero paused spots.
- A marker popup was opened in the live browser and still exposes the Google Maps itinerary action.
- `npm test`: 50 tests passed, 0 failed.
- `npm run build`: static build completed successfully.
- `node --check app.js` and `git diff --check`: passed; only Windows line-ending notices were reported.

## Mobile sheet swipe reliability correction

- The visible 38 × 4 px drag handle previously doubled as the entire touch target, making it impractical to grab on a phone.
- The handle now keeps the same discreet visual line but exposes a centered 96 × 44 px touch surface.
- Pointer capture is guarded for mobile browser differences, and touch scrolling is disabled only on intentional drag surfaces: the handle, modal header, detail header and spot photo.
- A real 288–290 px downward drag was exercised at the live 321 px mobile viewport on both the Add spot sheet and the spot-detail sheet; both dismissed successfully.
- `npm test`: 50 tests passed, 0 failed.
- `npm run build`, `node --check app.js` and `git diff --check`: passed.

final result: passed
