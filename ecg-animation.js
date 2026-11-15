(() => {
  'use strict';

  const start = () => {
    const source = document.getElementById('ecg');
    const wrap = source?.parentElement;
    if (!source || !wrap || wrap.dataset.polishedEcg === 'true') return;
    wrap.dataset.polishedEcg = 'true';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const overlay = document.createElement('canvas');
    overlay.className = 'ecg-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(wrap.style, { position: 'relative', overflow: 'hidden' });
    Object.assign(source.style, { opacity: '0' });
    Object.assign(overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    wrap.append(overlay);

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let paused = false;
    let elapsed = 0;
    let phase = 0;
    let previousFrame = 0;
    let smoothedBpm = 72;
    let activeTab = 'home';
    let switching = false;
    const phaseHistory = [{ time: 0, phase: 0 }];
    const bpmNode = document.getElementById('bpm');
    const toggle = document.getElementById('simulation-toggle');
    const reducedMotion = motionQuery.matches;

    // Unified, responsive visual system layered over the existing page styles.
    const uiStyles = document.createElement('style');
    uiStyles.textContent = `
      :root { --line: #e9e3e7; --muted: #827780; --wine: #51152f; --pink: #d83a62; --green: #17815e; --surface: #fff; --surface-soft: #fbf8fa; --shadow-soft: 0 8px 26px rgba(49, 18, 35, .065); }
      @keyframes forsyn-view-in { from { opacity: 0; transform: translate3d(0, 8px, 0) scale(.997); } to { opacity: 1; transform: none; } }
      @keyframes forsyn-view-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(0, -4px, 0); } }
      @keyframes forsyn-modal-in { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
      body { background: #f3eff2; color: #281f26; }
      .app { background: #fff; box-shadow: 0 24px 80px rgba(48, 20, 36, .12); }
      .header { padding: 18px 22px 14px; border-bottom-color: #f0ebee; }
      .brand small { color: #877c85; font-size: 9px; letter-spacing: .15em; }
      .brand h1 { color: #341626; letter-spacing: .045em; }
      .pill { border-color: #f0dce3; background: #fff7f9; box-shadow: 0 2px 6px rgba(75,16,40,.035); }
      .scroll { padding: 18px 18px calc(98px + var(--safe-bottom)); scroll-behavior: smooth; }
      .section-title { margin: 20px 2px 10px; color: #776b74; font-size: 10px; letter-spacing: .13em; }
      .ecg-card, .chart-card, .settings-card { border-color: var(--line); border-radius: 17px; box-shadow: var(--shadow-soft); }
      .ecg-card { padding: 14px; }
      .ecg-wrap { background: linear-gradient(180deg, #fffafd, #fff8fa); border: 1px solid #f5e9ed; }
      .ecg-title { color: #382a34; }
      .live-label { background: #fff5f7; border-radius: 999px; padding: 5px 8px; }
      .card { border-color: var(--line); border-radius: 16px; box-shadow: 0 3px 12px rgba(49,18,35,.035); }
      .card-value { color: #2b2029; font-variant-numeric: tabular-nums; }
      .card-state { white-space: nowrap; }
      .card-label, .ecg-foot { color: #827780; }
      .periods { padding: 4px; background: #f7f3f6; border-color: #eee7eb; }
      .period { min-height: 36px; font-size: 11px; transition: background-color 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 180ms ease; }
      .period.active { background: var(--wine); box-shadow: 0 3px 9px rgba(81,21,47,.18); }
      .summary-card { border-color: #eee8ec; background: linear-gradient(180deg,#fff,#fdfbfd); }
      .chart-card { padding: 14px; }
      .chart-head strong { color: #392d36; }
      .button-row { gap: 9px; }
      .app button { font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; cursor: pointer; }
      .app button:focus-visible { outline: 2px solid #d83a62; outline-offset: 3px; }
      .app .nav-btn, .app .period, .app .button-row button, .app .modal-actions button, .app .mini-btn, .app .btn {
        transition: transform 180ms cubic-bezier(.2,.8,.2,1), filter 180ms ease, box-shadow 220ms ease, background-color 220ms ease, color 220ms ease, border-color 220ms ease;
      }
      .app .nav-btn:active, .app .period:active, .app .button-row button:active, .app .modal-actions button:active, .app .mini-btn:active, .app .btn:active { transform: translateY(1px) scale(.975); filter: brightness(.98); }
      .button-row button, .modal-actions button { min-height: 42px; border: 1px solid #eee3e9; border-radius: 12px; background: #fff; color: #5d4352; font-size: 11px; font-weight: 650; box-shadow: 0 2px 5px rgba(49,18,35,.025); }
      .button-row button.primary, .modal-actions button:not(.secondary) { border-color: var(--wine); background: linear-gradient(135deg,#5b1b38,#451128); color: #fff; box-shadow: 0 5px 12px rgba(81,21,47,.15); }
      .button-row button:not(.primary):hover, .modal-actions button.secondary:hover { border-color: #dfc7d2; background: #fcf8fa; }
      .button-row button.primary:hover, .modal-actions button:not(.secondary):hover { filter: brightness(1.08); box-shadow: 0 7px 16px rgba(81,21,47,.2); }
      .app button#simulation-toggle { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; margin-top: 14px; border: 0; border-radius: 12px; background: linear-gradient(135deg,#5b1b38,#451128); color: #fff; font-size: 11px; font-weight: 700; box-shadow: 0 5px 14px rgba(81,21,47,.15); }
      .bottom { height: 76px; padding: 5px 12px calc(8px + var(--safe-bottom)); border-top-color: #eee8ec; box-shadow: 0 -7px 22px rgba(49,18,35,.035); backdrop-filter: blur(14px); }
      .nav-btn { min-height: 48px; border-radius: 12px; }
      .nav-btn.active { color: var(--wine); }
      .nav-btn.active i { transform: translateY(-1px); }
      .assistant-slot { box-shadow: 0 7px 20px rgba(75,16,40,.18); }
      .assistant-btn, #assistant-btn { transition: transform 180ms ease, box-shadow 200ms ease; }
      #assistant-btn:active { transform: scale(.93); }
      .setting-row { padding: 11px 2px; }
      .setting-row label { color: #493d46; line-height: 1.4; }
      .setting-row output { color: var(--wine); font-variant-numeric: tabular-nums; }
      .setting-row input[type=range] { height: 5px; border-radius: 99px; }
      .device { padding-bottom: 13px; }
      .device-icon { box-shadow: inset 0 0 0 1px #f4e3e9; }
      .modal-bg { background: rgba(31,20,28,.46); backdrop-filter: blur(5px); }
      .modal { border: 1px solid rgba(255,255,255,.75); border-radius: 20px; box-shadow: 0 24px 70px rgba(25,11,19,.24); animation: forsyn-modal-in 220ms cubic-bezier(.2,.75,.25,1) both; }
      .modal h2 { color: #351827; font-size: 16px; }
      .form-field input, .form-field textarea, .form-field select { min-height: 42px; border-color: #e9e1e6; border-radius: 11px; padding: 11px 12px; font: 12px inherit; }
      .form-field span { color: #594b55; }
      .insight { border-color: #eee0e7; border-radius: 13px; background: #fcf7fa; }
      .event { border: 1px solid #eee6eb; border-radius: 14px; background: #fff; box-shadow: 0 3px 10px rgba(49,18,35,.035); }
      .mini-btn { min-width: 36px; min-height: 36px; border: 1px solid #eee3e9; border-radius: 10px; background: #fff; }
      .empty { border: 1px dashed #e6dce2; border-radius: 14px; background: #fcfafb; color: #817680; }
      @media (hover: hover) {
        .card:hover, .ecg-card:hover, .chart-card:hover, .settings-card:hover { border-color: #e2d2db; box-shadow: 0 8px 24px rgba(49,18,35,.075); }
      }
      @media (max-width: 380px) {
        .scroll { padding-left: 13px; padding-right: 13px; }
        .header { padding-left: 16px; padding-right: 16px; }
        .button-row { gap: 6px; }
        .button-row button { padding: 9px 6px; font-size: 10px; }
      }
      @media (min-width: 640px) {
        .app { border-color: #f3edf1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .app button, .app input, .app textarea, .app select, .app .card, .app .ecg-card, .app .chart-card, .app .settings-card { transition: none !important; }
        .modal { animation: none; }
      }
    `;
    document.head.append(uiStyles);

    const titles = {
      home: ['FORSYN', 'Monitoreo personal'],
      history: ['Historial médico', 'Tendencias y bitácora'],
      alerts: ['Alertas', 'Umbrales y contactos'],
      settings: ['Ajustes', 'Dispositivo y preferencias']
    };

    function setActiveButton(tab) {
      document.querySelectorAll('.nav-btn[data-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
        button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false');
      });
    }

    function selectTab(tab) {
      if (!titles[tab] || switching || tab === activeTab) return;
      const current = document.getElementById(`view-${activeTab}`);
      const next = document.getElementById(`view-${tab}`);
      if (!current || !next) return;
      activeTab = tab;
      setActiveButton(tab);
      document.getElementById('header-title').textContent = titles[tab][0];
      document.getElementById('header-subtitle').textContent = titles[tab][1];
      if (reducedMotion) {
        current.hidden = true;
        next.hidden = false;
        return;
      }
      switching = true;
      current.style.animation = 'forsyn-view-out 150ms cubic-bezier(.4,0,.2,1) both';
      window.setTimeout(() => {
        current.hidden = true;
        current.style.animation = '';
        next.hidden = false;
        next.style.animation = 'forsyn-view-in 240ms cubic-bezier(.2,.75,.25,1) both';
        if (tab === 'history') window.dispatchEvent(new Event('resize'));
        window.setTimeout(() => { next.style.animation = ''; switching = false; }, 250);
      }, 145);
    }

    // Intercept the app's original instant tab handler and replace with the smooth switch.
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-tab]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectTab(button.dataset.tab);
    }, true);

    function resize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!rect.width || !rect.height) return;
      width = rect.width;
      height = rect.height;
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    }

    // Decorative P-QRS-T waveform only; the app has no connected ECG sensor.
    function beat(beatPhase, seconds) {
      const p = ((beatPhase % 1) + 1) % 1;
      const beatNumber = Math.floor(beatPhase);
      const gaussian = (x, center, spread) => Math.exp(-.5 * ((x - center) / spread) ** 2);
      const variation = 1 + .026 * Math.sin(beatNumber * 2.13) + .014 * Math.sin(beatNumber * .77);
      const morphology = .035 * Math.sin(p * Math.PI * 2)
        + .12 * gaussian(p, .19, .025) - .18 * gaussian(p, .385, .012)
        + 1.05 * gaussian(p, .405, .008) - .28 * gaussian(p, .425, .014)
        + .27 * gaussian(p, .69, .065);
      return morphology * variation + .012 * Math.sin(seconds * .72) + .006 * Math.sin(seconds * 1.91);
    }

    function phaseAt(time) {
      const history = phaseHistory;
      if (time <= history[0].time) return history[0].phase + (time - history[0].time) * smoothedBpm / 60;
      let low = 0, high = history.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (history[mid].time < time) low = mid + 1; else high = mid;
      }
      const after = history[low], before = history[Math.max(0, low - 1)];
      const span = after.time - before.time;
      return before.phase + (span > 0 ? (time - before.time) / span : 0) * (after.phase - before.phase);
    }

    function draw(now) {
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dt = previousFrame ? Math.min((now - previousFrame) / 1000, .05) : 0;
      previousFrame = now;
      const targetBpm = Math.max(40, Math.min(180, Number.parseInt(bpmNode?.textContent, 10) || 72));
      smoothedBpm += (targetBpm - smoothedBpm) * (1 - Math.exp(-dt / 1.2));
      if (!paused && !document.hidden && dt > 0) {
        elapsed += dt;
        phase += dt * smoothedBpm / 60;
        phaseHistory.push({ time: elapsed, phase });
        while (phaseHistory.length > 2 && phaseHistory[1].time < elapsed - 5) phaseHistory.shift();
      }
      ctx.clearRect(0, 0, width, height);
      const step = Math.max(12, Math.round(width / 22));
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += step) {
        ctx.strokeStyle = x % (step * 5) === 0 ? 'rgba(190,53,89,.10)' : 'rgba(190,53,89,.04)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y <= height; y += step) {
        ctx.strokeStyle = y % (step * 5) === 0 ? 'rgba(190,53,89,.10)' : 'rgba(190,53,89,.04)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      const secondsVisible = 2.8, centerY = height * .55, amplitude = height * .31;
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(1, 1 / dpr)) {
        const sampleTime = elapsed - ((width - x) / width) * secondsVisible;
        const y = centerY - beat(phaseAt(sampleTime), sampleTime) * amplitude;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const line = ctx.createLinearGradient(0, 0, width, 0);
      line.addColorStop(0, 'rgba(223,40,85,.16)'); line.addColorStop(.68, 'rgba(223,40,85,.70)'); line.addColorStop(1, '#ef4774');
      ctx.strokeStyle = line; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(223,40,85,.48)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      const sweepX = (elapsed * 54) % width;
      if (sweepX > 1) {
        const sweep = ctx.createLinearGradient(Math.max(0, sweepX - 28), 0, sweepX, 0);
        sweep.addColorStop(0, 'rgba(239,71,116,0)'); sweep.addColorStop(1, 'rgba(239,71,116,.10)');
        ctx.fillStyle = sweep; ctx.fillRect(Math.max(0, sweepX - 28), 0, Math.min(28, sweepX), height);
      }
      if (!paused && !reducedMotion && !document.hidden) raf = requestAnimationFrame(draw);
    }

    function stop() { paused = true; cancelAnimationFrame(raf); previousFrame = 0; draw(performance.now()); }
    function resume() { paused = false; previousFrame = 0; cancelAnimationFrame(raf); if (!reducedMotion && !document.hidden) raf = requestAnimationFrame(draw); }
    toggle?.addEventListener('click', () => requestAnimationFrame(() => /reanudar/i.test(toggle.textContent) ? stop() : resume()));
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf); previousFrame = 0;
      if (!document.hidden && !paused && !reducedMotion) raf = requestAnimationFrame(draw);
    });
    window.addEventListener('resize', resize, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
    resize();
    if (!reducedMotion) raf = requestAnimationFrame(draw);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
