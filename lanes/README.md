# Signal & Noise

A three-lane simultaneous-commitment game whose opponents build a model of you
and play against it. See `CLAUDE.md` for architecture and design notes.

## Run locally

ES modules require `http://` — opening `index.html` from the filesystem will not work.

    python -m http.server 8000     # then open http://localhost:8000

## Balance harness

    node tools/simulate.js         # MATCHES=2000 node tools/simulate.js for tighter numbers

## Deploy

Static files, no build step. Copy the whole directory to any static host.
`.nojekyll` is included so GitHub Pages serves the `src/` tree untouched.
