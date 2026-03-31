/** Returns the hard-coded demo problem. Replace with editor state later. */
function buildDemoProblem() {
  return {
    horizon_days: 14,
    assets: [
      { id: 'A1', duration_days: 3 },
      { id: 'B2', duration_days: 2 },
      { id: 'C3', duration_days: 4 },
    ],
    relationships: [
      { type: 'together', a: 'A1', b: 'B2' },
    ],
  };
}

/** POSTs the problem to the API and returns the parsed response JSON. */
async function solve(problem) {
  const res = await fetch('/cpsat/api/v1/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(problem),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Draws solution.items as positioned rectangles in #timeline.
 * @param {{ horizon_days: number, items: Array, relationships: Array }} solution
 */
function renderSolution(solution) {
  const container = document.getElementById('timeline');
  const legend = document.getElementById('legend');
  const relBox = document.getElementById('relationships');

  container.innerHTML = '';
  legend.innerHTML = '';
  relBox.innerHTML = '';

  const { horizon_days, items, relationships } = solution;
  const lanes = Math.max(...items.map(i => i.lane)) + 1;
  const LANE_H = 44;
  const LANE_GAP = 10;
  const TOP_OFFSET = 20; // space for day markers

  container.style.height = `${TOP_OFFSET + lanes * LANE_H + (lanes - 1) * LANE_GAP}px`;

  // Day tick marks
  const tickEvery = Math.ceil(horizon_days / 7);
  for (let d = tickEvery; d <= horizon_days; d += tickEvery) {
    const marker = document.createElement('div');
    marker.className = 'tl-marker';
    marker.style.left = `${(d / horizon_days) * 100}%`;
    marker.textContent = `d${d}`;
    container.appendChild(marker);
  }

  // Items
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tl-item';
    el.style.left = `${(item.start_day / horizon_days) * 100}%`;
    el.style.width = `${(item.duration_days / horizon_days) * 100}%`;
    el.style.top = `${TOP_OFFSET + item.lane * (LANE_H + LANE_GAP)}px`;
    el.style.height = `${LANE_H}px`;
    el.style.background = item.color;
    el.textContent = item.asset;
    container.appendChild(el);

    // Legend row
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = item.color;
    li.appendChild(dot);
    li.appendChild(
      document.createTextNode(
        `${item.asset} — day ${item.start_day}–${item.start_day + item.duration_days - 1}`
      )
    );
    legend.appendChild(li);
  });

  // Relationship badges
  (relationships || []).forEach(rel => {
    const badge = document.createElement('span');
    badge.className = 'rel-badge';
    badge.textContent = `${rel.type}: ${rel.a} + ${rel.b}`;
    relBox.appendChild(badge);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('solveBtn');
  const statusEl = document.getElementById('status');
  const resultSection = document.getElementById('result');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Solving…';
    statusEl.textContent = '';
    statusEl.classList.remove('error');
    resultSection.hidden = true;

    try {
      const problem = buildDemoProblem();
      const data = await solve(problem);
      renderSolution(data.solution);
      resultSection.hidden = false;
      statusEl.textContent = `${data.job_id} — ${data.status}`;
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Solve';
    }
  });
});
