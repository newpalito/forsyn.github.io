(() => {
  'use strict';

  const start = () => {
    const source = document.getElementById('ecg');
    const wrap = source?.parentElement;
    if (!source || !wrap || wrap.dataset.polishedEcg === 'true') return;
    wrap.dataset.polishedEcg = 'true';

    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = 'forsyn-theme.css';
    document.head.append(theme);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedMotion = motionQuery.matches;
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
    let elapsed = 0;
    let phase = 0;
    let previousFrame = 0;
    let paused = false;
    let smoothedBpm = 72;
    const history = [{ time: 0, phase: 0 }];
    const bpmNode = document.getElementById('bpm');
    const bpmReadout = document.getElementById('ecg-bpm');
    const toggle = document.getElementById('simulation-toggle');

    function setCanvasSize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!rect.width || !rect.height) return;
      width = rect.width;
      height = rect.height;
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(performance.now());
    }

    function phaseAt(time) {
      if (time <= history[0].time) return history[0].phase;
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
      const ratio = span ? (time - before.time) / span : 0;
      return before.phase + (after.phase - before.phase) * ratio;
    }

    // Deliberately stylized P-QRS-T demo morphology, not a medical waveform.
    function sample(beatPhase, time) {
      const p = ((beatPhase % 1) + 1) % 1;
      const beatNumber = Math.floor(beatPhase);
      const gaussian = (x, center, spread) => Math.exp(-.5 * ((x - center) / spread) ** 2);
      const amplitudeVariation = 1 + .018 * Math.sin(beatNumber * 2.17) + .009 * Math.sin(beatNumber * .73);
      const morphology = .025 * Math.sin(p * Math.PI * 2)
        + .105 * gaussian(p, .19, .026)
        - .16 * gaussian(p, .385, .012)
        + .98 * gaussian(p, .405, .008)
        - .25 * gaussian(p, .425, .014)
        + .24 * gaussian(p, .69, .067);
      const baselineWander = .009 * Math.sin(time * .57) + .004 * Math.sin(time * 1.37);
      return morphology * amplitudeVariation + baselineWander;
    }

    function drawGrid() {
      const small = Math.max(8, Math.round(height / 8));
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += small) {
        const major = Math.round(x / small) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(177,70,99,.13)' : 'rgba(177,70,99,.055)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y <= height; y += small) {
        const major = Math.round(y / small) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(177,70,99,.13)' : 'rgba(177,70,99,.055)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    function render(now) {
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dt = previousFrame ? Math.min((now - previousFrame) / 1000, .05) : 0;
      previousFrame = now;
      const target = Math.max(40, Math.min(180, Number.parseInt(bpmNode?.textContent, 10) || 72));
      smoothedBpm += (target - smoothedBpm) * (1 - Math.exp(-dt / .9));
      if (!paused && !document.hidden && dt > 0) {
        elapsed += dt;
        phase += dt * smoothedBpm / 60;
        history.push({ time: elapsed, phase });
        while (history.length > 2 && history[1].time < elapsed - 4.5) history.shift();
      }

      ctx.clearRect(0, 0, width, height);
      drawGrid();
      const secondsVisible = 3.2;
      const baseline = height * .54;
      const amplitude = height * .37;
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(.9, 1 / dpr)) {
        const time = elapsed - (width - x) / width * secondsVisible;
        const y = baseline - sample(phaseAt(time), time) * amplitude;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#b92750';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(185,39,80,.22)';
      ctx.shadowBlur = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Soft sweep marker is intentionally subtle; waveform remains continuous.
      const sweep = (elapsed * 44) % width;
      if (sweep > 0) {
        const start = Math.max(0, sweep - 20);
        const gradient = ctx.createLinearGradient(start, 0, sweep, 0);
        gradient.addColorStop(0, 'rgba(255,250,251,0)');
        gradient.addColorStop(1, 'rgba(255,250,251,.72)');
        ctx.fillStyle = gradient;
        ctx.fillRect(start, 0, sweep - start, height);
      }

      if (bpmReadout && bpmNode) bpmReadout.textContent = `${bpmNode.textContent.trim()} BPM`;
      if (!paused && !reducedMotion && !document.hidden) raf = requestAnimationFrame(render);
    }

    function updatePausedState() {
      const isPaused = /reanudar/i.test(toggle?.textContent || '');
      paused = isPaused;
      cancelAnimationFrame(raf);
      previousFrame = 0;
      if (!paused && !reducedMotion && !document.hidden) raf = requestAnimationFrame(render);
      else render(performance.now());
    }

    toggle?.addEventListener('click', () => requestAnimationFrame(updatePausedState));
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      previousFrame = 0;
      if (!document.hidden && !paused && !reducedMotion) raf = requestAnimationFrame(render);
    });
    window.addEventListener('resize', setCanvasSize, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(setCanvasSize).observe(wrap);
    setCanvasSize();
    if (!reducedMotion) raf = requestAnimationFrame(render);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
