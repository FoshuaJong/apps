    (function(){var g=document.getElementById('grid-spotlight');document.addEventListener('mousemove',function(e){g.style.setProperty('--mx',e.clientX+'px');g.style.setProperty('--my',e.clientY+'px');});document.addEventListener('mouseleave',function(){g.style.setProperty('--mx','-999px');g.style.setProperty('--my','-999px');});})();
  

    // Mobile nav
    const navToggle = document.getElementById('navToggle');
    const navLinks  = document.getElementById('navLinks');
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  

    const form      = document.getElementById('llForm');
    const submitBtn = document.getElementById('submitBtn');
    const quotaMsg  = document.getElementById('quotaMsg');
    const errorMsg  = document.getElementById('errorMsg');

    // ── Ready gate — button only enabled when token + both fields are set ──
    function checkReady() {
      const name = document.getElementById('userName').value.trim();
      const text = document.getElementById('userText').value.trim();
      submitBtn.disabled = !(cfToken && name && text);
    }

    document.getElementById('userName').addEventListener('input', checkReady);
    document.getElementById('userText').addEventListener('input', function () {
      const count = this.value.length;
      document.getElementById('charCount').textContent = count;
      document.getElementById('charCounter').classList.toggle('near-limit', count > 800);
      checkReady();
    });

    let cfToken = null;
    let currentPostBody = '';
    let status = 'idle';         // 'idle' | 'generating' | 'result'
    let isCustomResult = false;  // true only after a real generation, not a demo

    // ── Confirmation modal ───────────────────────────────────────
    function showConfirmModal(onConfirm) {
      const modal = document.getElementById('confirmModal');
      modal.hidden = false;
      document.getElementById('confirmProceed').onclick = () => {
        modal.hidden = true;
        onConfirm();
      };
      document.getElementById('confirmCancel').onclick = () => {
        modal.hidden = true;
      };
    }

    // ── "Load a classic" ─────────────────────────────────────────
    let cachedDemos = null;
    let classicIndex = -1;

    document.getElementById('classicBtn').addEventListener('click', async () => {
      if (!cachedDemos) {
        try {
          const r = await fetch('/linkedin_lessons/demos.json');
          cachedDemos = r.ok ? await r.json() : null;
        } catch { cachedDemos = null; }
      }
      if (!cachedDemos || !cachedDemos.length) return;
      classicIndex = (classicIndex + 1) % cachedDemos.length;
      const demo = cachedDemos[classicIndex];
      renderResultCard(demo, demo.name, demo.input, 1000);
      setStage('result');
      isCustomResult = false;
    });

    // ── Stage state machine ──────────────────────────────────────
    function setStage(newStatus) {
      status = newStatus;
      document.getElementById('stageIdle').hidden      = (newStatus !== 'idle');
      document.getElementById('stageGenerating').hidden = (newStatus !== 'generating');
      const result = document.getElementById('stageResult');
      result.hidden = (newStatus !== 'result');
      if (newStatus === 'result') {
        result.style.opacity = '0';
        // double rAF ensures hidden=false has been painted before transition fires
        requestAnimationFrame(() => requestAnimationFrame(() => {
          result.style.opacity = '1';
        }));
      }
      if (newStatus === 'generating' && window.innerWidth <= 640) {
        document.getElementById('llStage').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // ── Corporate terminal ───────────────────────────────────────
    const TERMINAL_STEPS = [
      'Bootstrapping synergy...',
      'Measuring KPIs...',
      'Circling back...',
      'Touching base offline...',
      'Fleshing out the strawman...',
      'Aligning paradigms...',
      'Faking authenticity...',
    ];

    function runTerminal() {
      const output = document.getElementById('terminalOutput');
      output.innerHTML = '';
      let i = 0;
      function addLine() {
        if (i >= TERMINAL_STEPS.length) return;
        const line = document.createElement('div');
        line.className = 'll-terminal-line';
        line.textContent = '> ' + TERMINAL_STEPS[i];
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
        i++;
        setTimeout(addLine, 1000 + Math.random() * 1500);
      }
      setTimeout(addLine, 200);
    }

    // ── Turnstile callbacks (must be global) ─────────────────────
    window.onTurnstileSuccess = function (token) {
      cfToken = token;
      submitBtn.hidden = false;
      quotaMsg.hidden = true;
      checkReady();
    };
    window.onTurnstileExpired = function () { cfToken = null; checkReady(); };
    window.onTurnstileError   = function () { cfToken = null; checkReady(); };

    // ── Utilities ────────────────────────────────────────────────
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getInitials(name) {
      return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }

    function avatarBg(name) {
      const palette = ['#0a66c2','#057642','#b24020','#6b4fbb','#c37d16','#1d6a96'];
      let hash = 0;
      for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
      return palette[Math.abs(hash) % palette.length];
    }

    // ── Render result into right column ─────────────────────────
    function renderResultCard(data, userName, userInput, activityIntervalMs = 3000, functional = false) {
      const reactionCount = Math.floor(Math.random() * 900) + 100;
      const timeAgo       = Math.floor(Math.random() * 59) + 1;
      const repostClass   = functional ? 'li-action li-action-functional' : 'li-action';
      const copyClass     = functional ? 'li-action li-action-functional' : 'li-action';

      document.getElementById('resultInput').textContent = userInput;
      document.getElementById('liCard').innerHTML = `
        <div class="li-header">
          <div class="li-avatar" style="background:${avatarBg(userName)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:17px;font-family:system-ui,sans-serif;">${getInitials(userName)}</div>
          <div class="li-meta">
            <div class="li-name">${escapeHtml(userName)}</div>
            <div class="li-headline">${escapeHtml(data.headline)}</div>
            <div class="li-sub">1st · ${timeAgo}m · 🌐</div>
          </div>
          <button class="li-more" aria-hidden="true">···</button>
        </div>
        <div class="li-body">${escapeHtml(data.post_body).replace(/\n/g, '<br>')}</div>
        <div class="li-reactions">
          <span>👍❤️🔥</span>
          <span>${escapeHtml(data.reaction_name)} and ${reactionCount} others</span>
        </div>
        <div class="li-divider"></div>
        <div class="li-action-bar">
          <button class="li-action">👍 Like</button>
          <button class="li-action">💬 Comment</button>
          <button class="${repostClass}" id="liRepost">🔁 Repost</button>
          <button class="${copyClass}" id="liCopy">✉️ Copy</button>
        </div>
      `;

      if (functional) {
        const shareUrl = 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(data.post_body);
        document.getElementById('liRepost').addEventListener('click', () => {
          window.open(shareUrl, '_blank', 'noopener');
        });
        const copyBtn = document.getElementById('liCopy');
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(data.post_body).catch(() => {});
          copyBtn.textContent = '✉️ Copied!';
          setTimeout(() => { copyBtn.textContent = '✉️ Copy'; }, 2000);
        });
      }

      renderActivityColumn(data.comments, 'resultActivity', activityIntervalMs);
    }

    function renderActivityColumn(comments, targetId, intervalMs = 3000) {
      const activity = document.getElementById(targetId);
      activity.innerHTML = '';
      comments.forEach(function (c, i) {
        const item = document.createElement('div');
        item.className = 'll-demo-activity-item';
        item.innerHTML =
          '<div class="li-comment-avatar" style="background:' + avatarBg(c.name) + '">' + getInitials(c.name) + '</div>' +
          '<div class="li-comment-body">' +
            '<span class="li-comment-name">' + escapeHtml(c.name) + '</span>' +
            '<span class="li-comment-title">' + escapeHtml(c.title) + '</span>' +
            '<p class="li-comment-text">' + escapeHtml(c.comment) + '</p>' +
          '</div>';
        item.style.animation = 'activity-item-in 400ms ease-out ' + ((i + 1) * intervalMs) + 'ms both';
        activity.appendChild(item);
      });
    }

    function resetTurnstile() {
      if (window.turnstile) window.turnstile.reset();
      cfToken = null;
      checkReady();
    }

    // ── Core generation logic ────────────────────────────────────
    async function generatePost(name, text) {
      submitBtn.disabled = true;
      quotaMsg.hidden = true;
      errorMsg.hidden = true;

      setStage('generating');
      runTerminal();

      try {
        // Warm up the CF Worker, then wait 1s for it to be ready before the real request
        fetch('/linkedin/api/generate', { method: 'GET' }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000));

        const res = await fetch('/linkedin/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, text, cfToken }),
        });

        if (res.status === 429) {
          setStage('idle');
          quotaMsg.hidden = false;
          submitBtn.hidden = true;
          resetTurnstile();
          return;
        }

        if (!res.ok) {
          setStage('idle');
          errorMsg.hidden = false;
          resetTurnstile();
          return;
        }

        const data = await res.json();
        currentPostBody = data.post_body;

        renderResultCard(data, name, text, 3000, true);
        setStage('result');
        isCustomResult = true;
        resetTurnstile(); // token is single-use; refresh silently for the next generation

      } catch {
        setStage('idle');
        errorMsg.hidden = false;
        resetTurnstile();
      }
    }

    // ── Form submit ──────────────────────────────────────────────
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('userName').value.trim().slice(0, 100);
      const text = document.getElementById('userText').value.trim().slice(0, 1000);
      if (!name || !text || !cfToken) return;

      if (status === 'result' && isCustomResult) {
        showConfirmModal(() => generatePost(name, text));
        return;
      }

      generatePost(name, text);
    });


  
