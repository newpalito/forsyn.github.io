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
    let lastFrame = 0;
    const bpmNode = document.getElementById('bpm');
    const toggle = document.getElementById('simulation-toggle');
    const reducedMotion = motionQuery.matches;
    const titles = {
      home: ['FORSYN', 'Monitoreo personal'],
      history: ['Historial médico', 'Tendencias y bitácora'],
      alerts: ['Alertas', 'Umbrales y contactos'],
      settings: ['Ajustes', 'Dispositivo y preferencias']
    };
    let activeTab = 'home';
    let switching = false;

    const transitionStyles = document.createElement('style');
    transitionStyles.textContent = `
      @keyframes forsyn-view-in {
        0% { opacity: 0; transform: translate3d(0, 8px, 0) scale(.995); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes forsyn-view-out {
        0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        100% { opacity: 0; transform: translate3d(0, -5px, 0) scale(1.005); }
      }
      .app .nav-btn,
      .app .period,
      .app .button-row button,
      .app .modal-actions button {
        transition: transform 180ms cubic-bezier(.2,.8,.2,1),
                    filter 180ms ease,
                    box-shadow 220ms ease,
                    background-color 220ms ease,
                    color 220ms ease;
      }
      .app .nav-btn:active,
      .app .period:active,
      .app .button-row button:active,
      .app .modal-actions button:active {
        transform: translateY(1px) scale(.975);
        filter: brightness(.98);
      }
      @media (prefers-reduced-motion: reduce) {
        .app .nav-btn,
        .app .period,
        .app .button-row button,
        .app .modal-actions button {
          transition: none !important;
        }
      }
    `;
    document.head.append(transitionStyles);

    const setActiveButton = (tab) => {
      document.querySelectorAll('.nav-btn[data-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
      });
    };

    const selectTab = (tab) => {
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
      current.style.animation = 'forsyn-view-out 180ms cubic-bezier(.4,0,.2,1) forwards';
      next.hidden = false;
      next.style.opacity = '0';
      next.style.transform = 'translate3d(0, 8px, 0) scale(.995)';
      next.style.animation = 'forsyn-view-in 260ms cubic-bezier(.2,.75,.25,1) forwards';

      window.setTimeout(() => {
        current.hidden = true;
        current.style.animation = '';
        next.style.animation = '';
        next.style.opacity = '';
        next.style.transform = '';
        switching = false;
      }, 260);
    };

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-tab]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
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

    // A stylized P-QRS-T beat for decorative demonstration only; not sensor data.
    function beat(t) {
      const p = ((t % 1) + 1) % 1;
      const gaussian = (x, center, spread) => Math.exp(-0.5 * ((x - center) / spread) ** 2);
      return 0.035 * Math.sin(p * Math.PI * 2)
        + 0.12 * gaussian(p, 0.19, 0.025)
        - 0.18 * gaussian(p, 0.385, 0.012)
        + 1.05 * gaussian(p, 0.405, 0.008)
        - 0.28 * gaussian(p, 0.425, 0.014)
        + 0.27 * gaussian(p, 0.69, 0.065);
    }

    function draw(now) {
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, width, height);

      const step = Math.max(12, Math.round(width / 22));
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += step) {
        ctx.strokeStyle = x % (step * 5) === 0 ? 'rgba(190, 53, 89, .11)' : 'rgba(190, 53, 89, .045)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y <= height; y += step) {
        ctx.strokeStyle = y % (step * 5) === 0 ? 'rgba(190, 53, 89, .11)' : 'rgba(190, 53, 89, .045)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      const bpm = Math.max(40, Math.min(180, Number.parseInt(bpmNode?.textContent, 10) || 72));
      const secondsVisible = 2.8;
      const centerY = height * 0.55;
      const amplitude = height * 0.31;
      const time = (paused || reducedMotion) ? (lastFrame || now) : now;
      const phaseOffset = time / 1000 * bpm / 60;
      const xAt = x => (phaseOffset - (width - x) / width * secondsVisible * bpm / 60);
      const yAt = x => centerY - beat(xAt(x)) * amplitude;

      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(1, 1 / dpr)) {
        const y = yAt(x);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const line = ctx.createLinearGradient(0, 0, width, 0);
      line.addColorStop(0, 'rgba(223, 40, 85, .12)');
      line.addColorStop(.68, 'rgba(223, 40, 85, .58)');
      line.addColorStop(.94, '#ef4774');
      line.addColorStop(1, '#ff8aa6');
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(223, 40, 85, .55)';
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const headX = width - ((time / 1000 * 58) % width);
      const headY = yAt(headX);
      const beam = ctx.createLinearGradient(headX - 36, 0, headX + 2, 0);
      beam.addColorStop(0, 'rgba(239, 71, 116, 0)');
      beam.addColorStop(1, 'rgba(239, 71, 116, .14)');
      ctx.fillStyle = beam;
      ctx.fillRect(Math.max(0, headX - 36), 0, Math.min(38, width - Math.max(0, headX - 36)), height);
      ctx.beginPath(); ctx.arc(headX, headY, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#e93966';
      ctx.shadowColor = 'rgba(223, 40, 85, .75)'; ctx.shadowBlur = 12;
      ctx.fill(); ctx.shadowBlur = 0;

      if (!paused && !reducedMotion && !document.hidden) raf = requestAnimationFrame(draw);
    }

    function stop() {
      paused = true;
      cancelAnimationFrame(raf);
      draw(performance.now());
    }
    function resume() {
      paused = false;
      lastFrame = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    toggle?.addEventListener('click', () => {
      requestAnimationFrame(() => /reanudar/i.test(toggle.textContent) ? stop() : resume());
    });
    document.addEventListener('visibilitychange', () => document.hidden ? cancelAnimationFrame(raf) : (!paused && !reducedMotion && resume()));
    window.addEventListener('resize', resize, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
    resize();
    if (!reducedMotion) raf = requestAnimationFrame(draw);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
