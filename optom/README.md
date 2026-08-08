# Optom note builder

Three independent note builders on one page (History / Anterior / Posterior),
sharing a single preview footer. No build step, no dependencies.

## Files

| File | What lives here |
|---|---|
| `schema.js` | **Option tables.** What findings exist and how they are worded. |
| `state.js` | State factories. `fresh*` = all off, `default*` = what Reset restores. |
| `notes.js` | Pure state → note text. No DOM, so it is directly testable. |
| `app.js` | DOM: render, refresh (sync buttons to model), click handlers, theme. |
| `notes.test.js` | Golden-note assertions. |
| `index.html` | Markup shell. History cards are generated, not written here. |

## Making a change

**Adding or rewording a finding is a one-line edit to `schema.js`.** State,
markup, button highlighting and note text all derive from those tables — resist
adding a matching branch in `app.js` or `notes.js`.

- Anterior/posterior per-eye findings → the relevant `*_CONDITIONS` array.
  `grades: true` gives 1–4 chips, `choices: [...]` gives named chips, neither
  gives a plain on/off chip. `text` overrides the button label in the note.
- History options → the relevant group in `HISTORY_GROUPS`.
- Posterior canned-text toggles → `POSTERIOR_TOGGLES` (`path` says where the
  boolean lives, so nested `imaging.*` fields need no special case).

Then run the tests:

```
node optom/notes.test.js
```

Add a case to `notes.test.js` for any new wording. The assertions are the exact
strings that get pasted into a patient record, so they are the real contract —
if a refactor changes one, that is a bug unless it was the point of the change.

## Note format conventions

- Anterior and posterior join their sections with `" | "`. History joins its
  clauses with `", "`.
- A finding present on both eyes with identical wording compacts to
  `<finding> OU`. Anything left over stays under its own `R `/`L ` prefix, so
  one eye can compact while the other spells findings out.
- Findings on the same eye join with a space on anterior, `", "` on posterior.
- Nasal + temporal findings (conj ping, corneal pterygium) collapse to
  `<noun> N+T`; a single side reads `nasal <noun>` / `temporal <noun>`.
- Some sections have an always-present baseline rather than a clear/not-clear
  flag: ONH (`distinct margins, evenly perfused`), macula (`flat, even
  pigmentation, clear reflex`, or `dim reflex` when that toggle is on), and
  periphery (`mid periphery clear undilated 90D`).

## Known gaps

- **PPA on both eyes at once is unverified.** `onhText` joins the two with a
  space (`R PPA L PPA, distinct margins...`); no reference note confirms the
  wording. Check with the clinician before relying on it.
- The DOM layer has no automated tests — `notes.test.js` covers the note text
  only. Verify UI changes by loading the page (`python3 -m http.server` from
  this directory) and clicking through all three tabs.
