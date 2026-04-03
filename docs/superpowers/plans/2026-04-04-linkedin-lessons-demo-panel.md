# LinkedIn Lessons Demo Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side demo panel to `/linkedin_lessons/` that fetches pre-authored examples from `demos.json` and displays a LinkedIn card with a rotating comment carousel.

**Architecture:** Two-column grid layout (form left, demo right). Demo panel fetches `linkedin_lessons/demos.json` on page load, shows a skeleton while loading, then renders one card at a time with auto-advancing comments. All state is managed in a single IIFE `<script>` block appended to the existing scripts. No new files other than `demos.json`.

**Tech Stack:** Vanilla HTML/CSS/JS, CSS `@keyframes` for skeleton pulse and slide-in transitions, `fetch()` for JSON loading.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `linkedin_lessons/demos.json` | Pre-authored demo data; matches API output schema + `input`, `name`, `reaction_count` fields |
| Modify | `linkedin_lessons/index.html` | Layout CSS, skeleton CSS, demo panel CSS, transition CSS, HTML restructure, demo JS |

---

## Task 1: Create `demos.json`

**Files:**
- Create: `linkedin_lessons/demos.json`

- [ ] **Step 1: Create the file**

Create `linkedin_lessons/demos.json` with three complete demo entries:

```json
[
  {
    "input": "I failed my driving test twice.",
    "name": "Joshua Fong",
    "headline": "Visionary in Motion | Navigating Life's Detours | ex-McKinsey | Resilience Coach | Dog Dad",
    "post_body": "I failed.\n\nNot once.\n\nTwice.\n\nThe examiner looked at me with that specific kind of pity reserved for people who indicate left and turn right.\n\nAnd in that moment, I realised something.\n\nFailure is not the opposite of success.\n\nIt is the curriculum.\n\nEvery missed mirror check was feedback.\nEvery emergency stop was a masterclass in presence.\n\nI passed on my third attempt.\n\nBut more importantly — I passed on my own terms.\n\nIf the road feels long, maybe you're just not in the right lane yet.",
    "reaction_name": "Priya Nair",
    "reaction_count": 1842,
    "comments": [
      {
        "name": "Marcus Webb",
        "title": "Growth Lead | Navigating Complexity | ex-Uber | Building in Public",
        "comment": "This is exactly why resilience is the new KPI. The third attempt is where character is built. 🙌"
      },
      {
        "name": "Fatima Al-Hassan",
        "title": "2x Founder | Strategic Advisor | LinkedIn Top Voice 2024",
        "comment": "Needed this today. The lane metaphor is everything."
      },
      {
        "name": "Daniel Park",
        "title": "Senior Strategy Lead | Change Maker | Keynote Speaker",
        "comment": "Failure as curriculum — I'm putting this on our team's Notion page. Real leadership energy here. 💡"
      }
    ]
  },
  {
    "input": "I got rejected from my dream job.",
    "name": "Sarah Chen",
    "headline": "Chief Possibility Officer | Rewriting Rejection | ex-Goldman | Purpose-Led Leader | Mom of 3",
    "post_body": "They said no.\n\nA two-line email.\n\nNo feedback. No call.\n\nJust: \"We've decided to move forward with other candidates.\"\n\nI sat with that for exactly 11 minutes.\n\nThen I opened my laptop.\n\nBecause here's what they didn't know:\n\nEvery closed door is a redirect, not a dead end.\n\nSix months later I built the company that company was trying to hire me to fix.\n\nRejection didn't break me.\n\nIt gave me the brief.\n\nYour dream job might just be the one you haven't invented yet.",
    "reaction_name": "Amir Hosseini",
    "reaction_count": 4271,
    "comments": [
      {
        "name": "Lena Kovács",
        "title": "Head of People | Culture Architect | ex-Stripe | She/Her",
        "comment": "\"Rejection gave me the brief\" — screenshot'd and sent to my entire network. This is the content LinkedIn was made for. 🔥"
      },
      {
        "name": "Tom Okafor",
        "title": "3x Founder | Operator | Investor | Building What's Next",
        "comment": "The pivot from rejection to founder is a story I see in every great builder. Powerful share, Sarah."
      },
      {
        "name": "Yuki Tanaka",
        "title": "Senior Innovation Lead | Future of Work Enthusiast | LinkedIn Top Voice 2023",
        "comment": "This resonates so deeply. Closed doors really are just GPS recalculating. 🙏"
      }
    ]
  },
  {
    "input": "My flight got cancelled and I missed an important meeting.",
    "name": "James Oduya",
    "headline": "Executive in Transit | Mastering the Uncontrollable | ex-Deloitte | Systems Thinker | Frequent Flyer",
    "post_body": "Gate B14.\n\nDelayed. Then cancelled.\n\nThe meeting I'd prepared three weeks for — gone.\n\nI watched grown adults argue with airport staff about weather.\n\nAnd I thought: this is the whole game, isn't it.\n\nYou can't control the fog.\n\nYou can only control how you move through it.\n\nI called the client from a café next to a Pret A Manger.\n\nNo slides. No deck. Just clarity.\n\nWe closed the deal.\n\nSometimes the cancelled flight is the pitch.\n\nThe best leaders I know aren't prepared for everything.\n\nThey're comfortable with anything.",
    "reaction_name": "Chioma Eze",
    "reaction_count": 987,
    "comments": [
      {
        "name": "Raj Mehta",
        "title": "Principal at Scale | Operations Excellence | ex-BCG | Advisor",
        "comment": "\"Comfortable with anything\" is a leadership superpower that can't be taught in an MBA. 🎯"
      },
      {
        "name": "Sofia Bergström",
        "title": "Chief of Staff | Executive Coach | Building Calm Leaders",
        "comment": "The Pret A Manger detail is doing a lot of work here and I am here for it. Brilliant post."
      },
      {
        "name": "Kevin Asante",
        "title": "VP Growth | Revenue Obsessed | 2x Exit | Now Advising",
        "comment": "Closed a deal from Gate B14 energy is the vibe we all need this quarter honestly. ✈️"
      }
    ]
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add linkedin_lessons/demos.json
git commit -m "feat: add linkedin lessons demo data"
```

---

## Task 2: Add layout CSS and restructure HTML

**Files:**
- Modify: `linkedin_lessons/index.html`

- [ ] **Step 1: Add layout and skeleton CSS**

Inside the existing `<style>` tag, add the following after the `@media (max-width: 640px)` block (before `</style>`):

```css
    /* ── Two-column layout ── */
    .ll-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: start;
    }

    .ll-left {
      min-width: 0;
    }

    /* ── Skeleton ── */
    @keyframes skel-pulse {
      0%, 100% { opacity: 0.35; }
      50%       { opacity: 0.65; }
    }

    .ll-demo-skeleton {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 1rem;
    }

    .skel {
      background: var(--bg-elevated);
      animation: skel-pulse 1.6s ease-in-out infinite;
    }

    .skel-header {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .skel-avatar-lg {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .skel-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding-top: 4px;
    }

    .skel-line {
      height: 10px;
    }

    .skel-w-90 { width: 90%; }
    .skel-w-80 { width: 80%; }
    .skel-w-70 { width: 70%; }
    .skel-w-55 { width: 55%; }
    .skel-w-40 { width: 40%; }

    .skel-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .skel-actions {
      height: 32px;
      width: 100%;
    }

    /* ── Demo panel ── */
    .ll-demo-framing {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--text-muted);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .ll-demo-input {
      font-size: 0.9rem;
      color: var(--text-secondary);
      font-weight: 300;
      font-style: italic;
      border-left: 2px solid var(--border);
      padding-left: 0.75rem;
      margin: 0 0 1.25rem;
    }

    .ll-demo-comment {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin-top: 0.75rem;
      min-height: 72px;
    }

    .ll-demo-dots {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.75rem;
      justify-content: center;
    }

    .ll-demo-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--border);
      cursor: pointer;
      border: none;
      padding: 0;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .ll-demo-dot.active {
      background: var(--accent);
    }

    .ll-demo-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-top: 1.25rem;
    }

    .ll-demo-arrow {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      width: 2rem;
      height: 2rem;
      font-size: 1.1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s, color 0.2s;
    }

    .ll-demo-arrow:hover {
      border-color: var(--accent-border-hover);
      color: var(--text-primary);
    }

    .ll-demo-counter {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--text-muted);
      letter-spacing: 0.08em;
    }

    /* ── Slide-in transitions ── */
    @keyframes slide-in-right {
      from { opacity: 0; transform: translateX(12px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    @keyframes slide-in-left {
      from { opacity: 0; transform: translateX(-12px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .anim-from-right { animation: slide-in-right 250ms ease-out both; }
    .anim-from-left  { animation: slide-in-left  250ms ease-out both; }

    @media (max-width: 900px) {
      .ll-layout {
        grid-template-columns: 1fr;
        gap: 3rem;
      }
    }
```

- [ ] **Step 2: Restructure the main content HTML**

Replace this block in `<main>`:

```html
      <form class="ll-form" id="llForm" novalidate>
        ...entire form...
      </form>

      <div class="ll-output" id="outputSection" hidden>
        ...entire output div...
      </div>
```

With:

```html
      <div class="ll-layout">
        <div class="ll-left">

          <form class="ll-form" id="llForm" novalidate>
            ...entire form (unchanged)...
          </form>

          <div class="ll-output" id="outputSection" hidden>
            ...entire output div (unchanged)...
          </div>

        </div>

        <div class="ll-demo" id="llDemo">

          <div class="ll-demo-skeleton" id="demoSkeleton">
            <div class="skel-header">
              <div class="skel skel-avatar-lg"></div>
              <div class="skel-meta">
                <div class="skel skel-line skel-w-80"></div>
                <div class="skel skel-line skel-w-55"></div>
              </div>
            </div>
            <div class="skel-body">
              <div class="skel skel-line skel-w-90"></div>
              <div class="skel skel-line skel-w-70"></div>
              <div class="skel skel-line skel-w-80"></div>
              <div class="skel skel-line skel-w-40"></div>
              <div class="skel skel-line skel-w-90"></div>
            </div>
            <div class="skel skel-actions"></div>
          </div>

          <div class="ll-demo-content" id="demoContent" hidden>
            <p class="ll-demo-framing">Instead of saying:</p>
            <blockquote class="ll-demo-input" id="demoInput"></blockquote>
            <div class="li-card" id="demoCard"></div>
            <div class="ll-demo-comment" id="demoComment"></div>
            <div class="ll-demo-dots" id="demoDots"></div>
            <div class="ll-demo-nav" id="demoNav" hidden>
              <button class="ll-demo-arrow" id="demoPrev" aria-label="Previous example">&#8249;</button>
              <span class="ll-demo-counter" id="demoCounter">1 / 1</span>
              <button class="ll-demo-arrow" id="demoNext" aria-label="Next example">&#8250;</button>
            </div>
          </div>

        </div>
      </div>
```

- [ ] **Step 3: Verify layout in preview**

Open `http://localhost:3001/linkedin_lessons/`. Confirm:
- Page shows two columns side by side on desktop
- Left column has the form
- Right column shows the skeleton (pulsing gray lines)
- At narrow viewport (≤900px) the columns stack

- [ ] **Step 4: Commit**

```bash
git add linkedin_lessons/index.html
git commit -m "feat: add two-column layout and demo skeleton"
```

---

## Task 3: Add demo panel JavaScript

**Files:**
- Modify: `linkedin_lessons/index.html`

- [ ] **Step 1: Add the demo script block**

Immediately before `</body>`, add a new `<script>` block after the existing scripts:

```html
  <script>
    (function () {
      var demos = [];
      var currentCard = 0;
      var currentComment = 0;
      var autoTimer = null;
      var paused = false;

      function animate(el, direction) {
        if (!direction) return;
        el.classList.remove('anim-from-right', 'anim-from-left');
        void el.offsetWidth; // force reflow to restart animation
        el.classList.add(direction === 'right' ? 'anim-from-right' : 'anim-from-left');
      }

      function renderDemoCard(demo, direction) {
        var card = document.getElementById('demoCard');
        document.getElementById('demoInput').textContent = demo.input;
        card.innerHTML =
          '<div class="li-header">' +
            '<div class="li-avatar" style="background:' + avatarBg(demo.name) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:17px;font-family:system-ui,sans-serif;">' + getInitials(demo.name) + '</div>' +
            '<div class="li-meta">' +
              '<div class="li-name">' + escapeHtml(demo.name) + '</div>' +
              '<div class="li-headline">' + escapeHtml(demo.headline) + '</div>' +
              '<div class="li-sub">1st · 3m · 🌐</div>' +
            '</div>' +
            '<button class="li-more" aria-hidden="true">···</button>' +
          '</div>' +
          '<div class="li-body">' + escapeHtml(demo.post_body).replace(/\n/g, '<br>') + '</div>' +
          '<div class="li-reactions"><span>👍❤️🔥</span><span>' + escapeHtml(demo.reaction_name) + ' and ' + demo.reaction_count + ' others</span></div>' +
          '<div class="li-divider"></div>' +
          '<div class="li-action-bar">' +
            '<button class="li-action">👍 Like</button>' +
            '<button class="li-action">💬 Comment</button>' +
            '<button class="li-action">🔁 Repost</button>' +
            '<button class="li-action">✉️ Send</button>' +
          '</div>';
        animate(card, direction);
      }

      function buildDots(count) {
        var dots = document.getElementById('demoDots');
        dots.innerHTML = '';
        for (var i = 0; i < count; i++) {
          var btn = document.createElement('button');
          btn.className = 'll-demo-dot' + (i === 0 ? ' active' : '');
          btn.setAttribute('aria-label', 'Comment ' + (i + 1));
          (function (idx) {
            btn.addEventListener('click', function () {
              var dir = idx > currentComment ? 'right' : 'left';
              currentComment = idx;
              renderDemoComment(demos[currentCard], currentComment, dir);
              resetTimer();
            });
          })(i);
          dots.appendChild(btn);
        }
      }

      function renderDemoComment(demo, index, direction) {
        var c = demo.comments[index];
        var el = document.getElementById('demoComment');
        document.querySelectorAll('.ll-demo-dot').forEach(function (d, i) {
          d.classList.toggle('active', i === index);
        });
        el.innerHTML =
          '<div class="li-comment-avatar" style="background:' + avatarBg(c.name) + '">' + getInitials(c.name) + '</div>' +
          '<div class="li-comment-body">' +
            '<span class="li-comment-name">' + escapeHtml(c.name) + '</span>' +
            '<span class="li-comment-title">' + escapeHtml(c.title) + '</span>' +
            '<p class="li-comment-text">' + escapeHtml(c.comment) + '</p>' +
          '</div>';
        animate(el, direction);
      }

      function resetTimer() {
        clearInterval(autoTimer);
        autoTimer = setInterval(function () {
          if (paused) return;
          var next = (currentComment + 1) % demos[currentCard].comments.length;
          currentComment = next;
          renderDemoComment(demos[currentCard], currentComment, 'right');
        }, 3500);
      }

      function showCard(index, direction) {
        currentCard = index;
        currentComment = 0;
        renderDemoCard(demos[index], direction);
        buildDots(demos[index].comments.length);
        renderDemoComment(demos[index], 0, direction);
        document.getElementById('demoCounter').textContent = (index + 1) + ' / ' + demos.length;
        resetTimer();
      }

      fetch('/linkedin_lessons/demos.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (data) {
          if (!data || !data.length) return;
          demos = data;
          document.getElementById('demoSkeleton').hidden = true;
          document.getElementById('demoContent').hidden = false;
          if (demos.length > 1) {
            document.getElementById('demoNav').hidden = false;
          }
          showCard(0, null);
          document.getElementById('demoPrev').addEventListener('click', function () {
            showCard((currentCard - 1 + demos.length) % demos.length, 'left');
          });
          document.getElementById('demoNext').addEventListener('click', function () {
            showCard((currentCard + 1) % demos.length, 'right');
          });
          var demoEl = document.getElementById('llDemo');
          demoEl.addEventListener('mouseenter', function () { paused = true; });
          demoEl.addEventListener('mouseleave', function () { paused = false; });
        })
        .catch(function () {
          document.getElementById('demoSkeleton').hidden = true;
        });
    })();
  </script>
```

Note: `escapeHtml`, `getInitials`, and `avatarBg` are defined as globals in the earlier script block — this IIFE can reference them directly.

- [ ] **Step 2: Verify in preview**

Open `http://localhost:3001/linkedin_lessons/`. Confirm:
- Skeleton briefly flashes then is replaced by the demo content
- "Instead of saying:" framing appears with the input quote
- LinkedIn card renders with name, headline, post body, reactions, action bar
- One comment appears below the card with avatar, name, title, text
- Three dots appear below the comment; active dot is teal
- Comments auto-advance every 3.5s with a slide-in-from-right animation
- Clicking a dot jumps to that comment with the correct direction animation
- Hovering the right panel pauses auto-advance; moving away resumes it
- `‹ 1 / 3 ›` nav appears; clicking `›` slides in the next card from the right; `‹` from the left
- Switching cards resets to comment 0

- [ ] **Step 3: Commit**

```bash
git add linkedin_lessons/index.html
git commit -m "feat: add demo panel with comment carousel and card navigation"
```
