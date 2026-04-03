# LinkedIn Lessons — Demo Panel Design

**Date:** 2026-04-04
**Scope:** Add a right-side demo panel to `/linkedin_lessons/` showing pre-authored example cards loaded from a JSON file, with a per-card comment carousel.

---

## Goal

Give visitors a live preview of what the app produces without hitting the API. The panel sits alongside the form so users can see example output while deciding whether to submit.

---

## Layout

The page gets a `.ll-layout` two-column grid wrapping the form and demo panel:

- `grid-template-columns: 1fr 1fr`, `gap: 4rem`, `align-items: start`
- Left column: existing `.ll-form` (unchanged, `max-width: 560px`)
- Right column: `.ll-demo` panel
- The `.ll-intro` section (heading + description) stays above the grid, full-width

**Responsive:** at ≤900px collapse to single column; demo panel moves below the form.

---

## Data — `linkedin_lessons/demos.json`

Array of demo objects. Each entry matches the API output schema exactly, plus `input` (what the user actually said) and `name` (whose post it is) and `reaction_count` (deterministic, no random):

```json
[
  {
    "input": "I failed my driving test twice.",
    "name": "Joshua Fong",
    "headline": "Visionary Leader | Navigating Life's Detours | ex-McKinsey | Resilience Coach",
    "post_body": "I failed.\n\nNot once.\n\nTwice.\n\n...",
    "reaction_name": "Priya Nair",
    "reaction_count": 342,
    "comments": [
      { "name": "Marcus Webb", "title": "Growth Lead | ex-Uber | Building in Public", "comment": "This is why resilience is the new KPI. 🙌" },
      { "name": "Fatima Al-Hassan", "title": "2x Founder | Advisor | LinkedIn Top Voice 2024", "comment": "Needed this today." },
      { "name": "Daniel Park", "title": "Senior Strategy Lead | Change Maker", "comment": "The metaphor here is everything." }
    ]
  }
]
```

`input` and `name` are the only additions beyond what the worker returns. Real API responses can be copied in directly with those two fields added.

---

## Demo Panel — Components

### Framing header
- `"Instead of saying:"` label in `.section-label` mono style (no section label heading, just this)
- The `input` value as a styled quote — smaller, muted, light weight

### LinkedIn card
- Uses the identical `.li-card`, `.li-header`, `.li-body`, `.li-reactions`, `.li-action-bar` styles already in the page
- Renders: avatar (initials + `avatarBg()` color), `name`, `headline`, `post_body` (with `\n` → `<br>`), `reaction_name`, `reaction_count`
- **No comments inside the card** — comments are separate below

### Comment carousel
- One comment at a time, displayed below the card
- Each comment shows: initials avatar, commenter name, title, comment text — same visual style as the existing `.li-comment` / `.li-comment-body` layout but outside the card border
- Auto-advances every 3.5s
- Pauses on hover
- Three dot indicators below show active comment (0, 1, 2)
- Clicking a dot jumps to that comment

### Card navigation
- Prev `‹` / next `›` arrow buttons + `1 / N` counter
- Appears only if `demos.json` has more than one entry
- Switching cards resets the comment carousel to comment 0 and resets the auto-advance timer

---

## Loading State

While `demos.json` is fetching, the right column shows a skeleton screen:

- Avatar circle placeholder (48px, muted bg)
- Two short lines for name + headline
- Four to five lines of varying width for post body
- A row of four action placeholders
- Skeleton uses `var(--bg-card)` with a subtle shimmer animation (CSS `@keyframes` pulse on `opacity`)
- On fetch failure: right column collapses silently (no error shown to user)

---

## File Changes

| Action | File |
|---|---|
| Create | `linkedin_lessons/demos.json` |
| Modify | `linkedin_lessons/index.html` — layout grid, demo panel HTML, demo CSS, demo JS |

No worker changes. No shared CSS changes.

---

## Out of Scope

- User-navigable comment arrows (dots only)
- Transition animations between cards (instant swap)
- Showing more than one comment at a time
