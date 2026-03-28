# /nothing

Two linked pages that are thematic opposites — evasion and seeking.

## Pages

- `/nothing/index.html` — "there's **nothing** here"
- `/nothing/something/index.html` — "there was **something**"

"nothing" and "something" are the accent-colored words and cross-link to each other.

## Physics Model

Both pages use **pure lerp physics** — no velocity, no spring, no oscillation:
```
elX += (targetX - elX) * LERP
```
Target position = anchor + sum of push forces. Smooth, no overshoot.

Push forces use quadratic falloff `MAX_PUSH * (1 - dist/radius)²` — bounded and spike-free unlike 1/d².

## /nothing/ — Evasion

- Text flees cursor using lerp toward `anchor + cursorPush + edgePush + gravity`
- Cursor push: circular field from text center (uniform in all directions — thin text otherwise easier to approach top/bottom)
- Edge push: keeps text away from stage boundaries
- Gravity: weak bias toward stage center (`GRAVITY = 0.08` fraction of center–anchor offset)
- Single anchor; **relocates perpendicular** when displacement > `RELOCATE_DISP` and cursor is within `PATH_RADIUS` of the return-path segment
- **Click**: places anchor between cursor and current anchor, never on cursor (`CLICK_GAP = 80px`)
- `pointer-events: none` on `#fleeing-text`; `pointer-events: auto` on the inner `<a>` so "nothing" is still clickable

## /nothing/something/ — Seeking

- Text seeks cursor using same lerp constants as /nothing/ (matched feel)
- **Click**: anchor jumps to cursor, offset by `(textCenter − somethingCenter)` so the word "something" lands on cursor, not the full string's center
- Speed cap scales with distance: `Math.min(MAX_SPEED, distToAnchor * 0.18)` — decelerates into target, no overshoot
- No edge/gravity forces — text only moves on click
