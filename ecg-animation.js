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
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none'
    });
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

    // Cohesive interaction polish, scoped to this app so existing layout stays intact.
    const uiStyles = document.createElement('style');
    uiStyles.textContent = `
      @keyframes forsyn-view-in { from { opacity: 0; transform: translate3d(0, 7px, 0) scale(.997); } to { opacity: 1; transform: none; } }
      @keyframes forsyn-view-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(0, -4px, 0); } }
      .app button { font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
      .app button:focus-visible { outline: 2px solid #df2855; outline-offset: 3px; }
      .app .nav-btn, .app .period, .app .button-row button, .app .modal-actions button, .app .mini-btn, .app .btn {
        transition: transform 180ms cubic-bezier(.2,.8,.2,1), filter 180ms ease,
          box-shadow 220ms ease, background-color 220ms ease, color 220ms ease, border-color 220ms ease;
      }
      .app .nav-btn:active, .app .period:active, .app .button-row button:active,
      .app .modal-actions button:active, .app .mini-btn:active, .app .btn:active {
        transform: translateY(1px) scale(.975); filter: brightness(.98);
      }
      .app .button-row button:hover, .app .modal-actions button:hover, .app .mini-btn:hover, .app .btn:hover {
        box-shadow: 0 5px 14px rgba(75,16,40,.12);
      }
      .app input, .app textarea, .app select { transition: border-color 180ms ease, box-shadow 180ms ease; }
      .app input:focus, .app textarea:focus, .app select:focus { outline: none; border-color: #d65b7b; box-shadow: 0 0 0 3px rgba(223,40,85,.11); }
      .app .card, .app .ecg-card, .app .chart-card, .app .settings-card { transition: box-shadow 220ms ease, border-color 220ms ease; }
      .app .nav-btn.active { transform: translateY(-1px); }
      @media (hover: hover) {
        .app .card:hover, .app .ecg-card:hover, .app .chart-card:hover, .app .settings-card:hover { border-color: #e5d4dc; box-shadow: 0 7px 20px rgba(52,17,30,.09); }
      }
      @media (prefers-reduced-motion: reduce) {
        .app button, .app input, .app textarea, .app select, .app .card, .app .ecg-card, .app .chart-card, .app .settings-card { transition: none !important; }
        .app .nav-btn.active { transform: none; }
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
        window.setTimeout(() => {
          next.style.animation = '';
          switching = false;
        }, 250);
      }, 145);
    }

    // Capture navigation before the app's original instant-switch handlers.
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

    // Stylized P-QRS-T waveform for visual demonstration only; not sensor data.
    function beat(beatPhase, seconds) {
      const p = ((beatPhase % 1) + 1) % 1;
      const beatNumber = Math.floor(beatPhase);
      const gaussian = (x, center, spread) => Math.exp(-0.5 * ((x - center) / spread) ** 2);
      const variation = 1 + .026 * Math.sin(beatNumber * 2.13) + .014 * Math.sin(beatNumber * .77);
      const morphology = .035 * Math.sin(p * Math.PI * 2)
        + .12 * gaussian(p, .19, .025)
        - .18 * gaussian(p, .385, .012)
        + 1.05 * gaussian(p, .405, .008)
        - .28 * gaussian(p, .425, .014)
        + .27 * gaussian(p, .69, .065);
      const gentleDrift = .012 * Math.sin(seconds * .72) + .006 * Math.sin(seconds * 1.91);
      return morphology * variation + gentleDrift;
    }

    // Interpolate the integrated beat phase from a short timeline. Integrating
    // BPM avoids shifting the entire displayed trace when the displayed rate changes.
    function phaseAt(time) {
      const history = phaseHistory;
      if (time <= history[0].time) return history[0].phase + (time - history[0].time) * smoothedBpm / 60;
      let low = 0;
      let high = history.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (history[mid].time < time) low = mid + 1;
        else high = mid;
      }
      const after = history[low];
      const before = history[Math.max(0, low - 1)];
      const span = after.time - before.time;
      const fraction = span > 0 ? (time - before.time) / span : 0;
      return before.phase + (after.phase - before.phase) * fraction;
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

      const secondsVisible = 2.8;
      const centerY = height * .55;
      const amplitude = height * .31;
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(1, 1 / dpr)) {
        const sampleTime = elapsed - ((width - x) / width) * secondsVisible;
        const y = centerY - beat(phaseAt(sampleTime), sampleTime) * amplitude;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const line = ctx.createLinearGradient(0, 0, width, 0);
      line.addColorStop(0, 'rgba(223,40,85,.16)');
      line.addColorStop(.68, 'rgba(223,40,85,.70)');
      line.addColorStop(1, '#ef4774');
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(223,40,85,.48)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const sweepX = (elapsed * 54) % width;
      if (sweepX > 1) {
        const sweep = ctx.createLinearGradient(Math.max(0, sweepX - 28), 0, sweepX, 0);
        sweep.addColorStop(0, 'rgba(239,71,116,0)');
        sweep.addColorStop(1, 'rgba(239,71,116,.10)');
        ctx.fillStyle = sweep;
        ctx.fillRect(Math.max(0, sweepX - 28), 0, Math.min(28, sweepX), height);
      }
      if (!paused && !reducedMotion && !document.hidden) raf = requestAnimationFrame(draw);
    }

    function stop() {
      paused = true;
      cancelAnimationFrame(raf);
      previousFrame = 0;
      draw(performance.now());
    }
    function resume() {
      paused = false;
      previousFrame = 0;
      cancelAnimationFrame(raf);
      if (!reducedMotion && !document.hidden) raf = requestAnimationFrame(draw);
    }

    toggle?.addEventListener('click', () => {
      requestAnimationFrame(() => /reanudar/i.test(toggle.textContent) ? stop() : resume());
    });
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      previousFrame = 0;
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
