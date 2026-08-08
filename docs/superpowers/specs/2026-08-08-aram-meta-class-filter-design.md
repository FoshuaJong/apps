# ARAM Meta — Class Filter & Grouping — Design Spec
**Date:** 2026-08-08

## Overview

Replace the ARAM meta app's tier filter (`All/S/A/B/C/D`) with a class filter (`All/Assassin/Fighter/Mage/Marksman/Support/Tank`), scraped from mayhemmeta.com's per-class pages. Tier stays as display-only data (tooltip badge, table column); it no longer drives filtering or chart color. Class becomes visible on the chart via a small shape marker per point (not color — see Constraint below), plus the new filter buttons, a tooltip "Classes" row, and a table "Classes" column.

## Background / Constraint

This project's `CLAUDE.md` design constraints are non-negotiable: monochrome palette, single teal accent, used sparingly. The current tier coloring is a single-hue ordinal ramp — valid because tier is an *ordered* scale (S > A > B > C > D). Class is unordered (6 unrelated categories, and a champion can belong to more than one), so a proper categorical encoding would need genuinely distinct hues — which breaks the monochrome rule. Resolution (confirmed with the user): dots and portrait rings stay a single teal, unchanged. Class identity is carried by a small monochrome **shape marker** anchored to each portrait (not text, not color — see Frontend section for why), plus the filter buttons, legend, tooltip, and table.

## Data model

Each champion object gains two fields:

```json
{
  "name": "Ahri",
  "slug": "ahri",
  "classes": ["Assassin", "Mage"],
  "primaryClass": "Mage",
  "...": "existing fields (tier, winRate, pickRate, kills, deaths, ...) unchanged"
}
```

- `classes`: every class the champion appears under on an unfiltered `?class=X` page. Drives the filter (`classes.includes(activeClass)`) and the tooltip/table "Classes" list.
- `primaryClass`: the one class where `?class=X&primary=1` includes this champion. Drives the single shape marker on the chart. `null` if a champion doesn't appear in any primary set (defensive — shouldn't happen, but the frontend must not crash if it does).

`CLASS_ORDER = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank']` — matches the site's own button order; used consistently for filter buttons, legend order, and marker-shape assignment.

## Worker changes (`worker/src/aram_meta_api.js`)

`scrapeAramMeta()` currently makes 1 fetch. It now makes 13, run in parallel with `Promise.all`:

- 1 fetch to `SOURCE_URL` (`?class=All`) — unchanged, full stats via the existing `parseAramMetaHtml`.
- 6 fetches to `?class={X}` for each `X` in `CLASS_ORDER` — a new, lighter parse (`scrapeClassSlugs(url)`) that only walks `tbody tr td a[href^="/champions/"]` and collects the slug from each row's `href`. No stat columns needed here.
- 6 fetches to `?class={X}&primary=1` — same lightweight slug parse.

After all 13 resolve, build two maps keyed by slug — `classesOf: Record<string, string[]>` (from the 6 plain class fetches, a champion's slug is added under every class page it appeared on) and `primaryClassOf: Record<string, string>` (from the 6 `primary=1` fetches). Merge into each champion from the main scrape: `champion.classes = classesOf[champion.slug] ?? []`, `champion.primaryClass = primaryClassOf[champion.slug] ?? null`.

**Partial-failure handling:** this is the exact failure mode that caused the "No champion data available" bug we just fixed — a rigid all-or-nothing dependency silently producing empty data. The 12 class fetches must not be allowed to take down the main stats scrape. Wrap the 12 class/primary fetches (not the main stats fetch) in a way that a single failed fetch degrades to an empty slug set for that one class rather than throwing — e.g. `Promise.allSettled`, logging a warning per rejected fetch, treating a rejected result as an empty `Set()`. Worst case with a class fetch down: those champions show `classes: []` / `primaryClass: null` (excluded from that one filter button, no shape marker) — degraded, not broken. The main stats fetch failing still fails the whole scrape, same as today (that's the one dependency that's actually required).

## Frontend changes

### Filter (`index.html` + `app.js` + `style.css`)

`.tier-filters` buttons (`All/S/A/B/C/D`) become `.class-filters` buttons (`All/Assassin/Fighter/Mage/Marksman/Support/Tank`), reusing the exact `.tier-btn` CSS pattern (renamed `.class-btn` — same visual treatment, no new component). Same single-select interaction as today: `state.activeClass` replaces `state.activeTier`, same explicit-hide-on-chart pattern from the b68683a fix (`g.setAttribute('hidden', 'true')` when not matching), same table-exclude pattern. Visibility check becomes `activeClass === 'all' || c.classes.includes(activeClass)`.

### Chart marker (shape, not text)

The approved direction was "distinguish class by shape/icon," not a color ramp. A 2-letter mono text badge was the first idea, but at this app's density (~170 points, 18px-diameter portraits) small text is a legibility risk — shape silhouettes read faster than 2-character abbreviations at that scale, which is why marker *shape* (not text) is the better fit for what was actually approved. Six portrait-ring shapes, one per `primaryClass`, replacing the current always-circular ring:

| Class | Ring shape |
|---|---|
| Assassin | Circle (unchanged — most common default) |
| Fighter | Square |
| Mage | Diamond |
| Marksman | Triangle |
| Support | Pentagon |
| Tank | Hexagon |

The portrait image itself stays circle-clipped (no change to `#portraitClip`) for visual consistency across all points; only the outline ring around it changes shape per class, teal stroke throughout (monochrome preserved), sized to the same bounding box as today's ring (`PORTRAIT_R`-based) so hit-target size and layout math don't change. Fallback for the defensive `primaryClass === null` case: render the current circle ring — same as the Assassin shape, so there's no visually distinct "unknown" state to design for.

Legend swatches show the shape outline next to the class name instead of a color dot: `.legend-dot` (a `<span>` with `border-radius: 50%`) is replaced by `.legend-shape`, six small inline `<svg>` elements (one per class, same six shapes as the chart rings) built with the same `svgEl` helper already used for the chart — no new sprite/asset system, just six more calls to existing chart-drawing code reused at legend scale.

### Tooltip & table

Tooltip: keep the existing `.tooltip-tier` badge as-is (unchanged position/style), add a new row below it — `tooltipRow('Classes', champ.classes.join(', ') || '—')`.

Table: keep the Tier column as-is, add a "Classes" column after it (`c.classes.join(', ')`, no `data-sort` attribute — an array has no natural sort order, consistent with how the removed "Games" column's absence was handled).

### Copy

`.hero-sub` text ("Brighter dots are higher tier.") needs updating since tier no longer drives visual prominence — something like "Every champion's pick rate plotted against win rate, scraped from mayhemmeta.com on a schedule. Shape marks class."

## Files touched

| Path | Change |
|---|---|
| `worker/src/aram_meta_api.js` | Add `scrapeClassSlugs`, fan out to 13 fetches, merge `classes`/`primaryClass` into each champion, `Promise.allSettled` resilience for the 12 class fetches |
| `aram_meta/app.js` | `state.activeTier` → `state.activeClass`, filter logic, chart ring-shape rendering (replacing circle-only ring), legend rebuild, tooltip Classes row, table Classes column/cell |
| `aram_meta/index.html` | Filter button markup (class buttons instead of tier buttons), table header `<th>` for Classes, hero copy update |
| `aram_meta/style.css` | `.tier-filters`/`.tier-btn` → `.class-filters`/`.class-btn` (same rules, renamed), legend shape swatches, ring-shape SVG helper styles if needed |

## Rollout

Same as the last two fixes: commit → `npx wrangler deploy` → hit `GET /aram_meta/api/debug-scrape` to force an immediate rescrape (required here since the KV JSON shape itself changes, not just values) → verify in-browser (filter buttons, chart shapes/legend, tooltip, table).

## Out of scope

- Multi-select or intersection filtering (explicitly deferred — single-select only, per design discussion)
- Recoloring dots by class (explicitly rejected — breaks the monochrome design rule)
- Any change to the existing tier data, tier legend removal, or tier column removal — tier stays, just stops driving filter/color
- Sorting the table by the new Classes column
