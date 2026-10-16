'use strict';
(() => {
  const audio = document.getElementById('audio');
  const canvas = document.getElementById('waveform');
  const paint = canvas.getContext('2d');
  if (!paint) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const capture = audio.captureStream || audio.mozCaptureStream;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const samples = new Float32Array(2048), levels = new Float32Array(72);
  let context, analyser, stream, source, frame = 0, last = 0, width = 0, height = 0;
  // Without an analyser there is nothing true to draw, so the canvas leaves the bar.
  const unavailable = () => !capture || !AudioContext || reduced.matches;
  canvas.hidden = unavailable();

  function draw(active = false) {
    paint.clearRect(0, 0, width, height);
    if (!active) return;
    paint.lineWidth = 2; paint.lineCap = 'round'; paint.strokeStyle = '#f0ede5';
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    levels.copyWithin(0, 1);
    levels[levels.length - 1] = Math.min(1, Math.sqrt(energy / samples.length) * 2);
    const count = Math.min(levels.length, Math.floor(width / 5));
    for (let i = 0; i < count; i++) {
      const level = levels[Math.floor(i * levels.length / count)];
      const size = Math.max(1, level * (height / 2 - 2)), x = (i + .5) * width / count;
      paint.beginPath(); paint.moveTo(x, height / 2 - size); paint.lineTo(x, height / 2 + size); paint.stroke();
    }
  }
  function tick(time) {
    if (time - last >= 33) { draw(true); last = time; }
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0;
    source?.disconnect(); source = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    levels.fill(0); draw();
  }
  function start() {
    stop();
    if (!context || reduced.matches || document.hidden || audio.paused || audio.readyState < 3) return;
    try {
      // Analyze a separate capture. Native audio never passes through this context.
      stream = capture.call(audio);
      if (!stream.getAudioTracks().length) { stop(); return; }
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      context.resume().catch(stop);
      frame = requestAnimationFrame(tick);
    } catch { stop(); }
  }
  function enable() {
    if (unavailable()) return;
    try {
      if (!context) {
        context = new AudioContext(); analyser = context.createAnalyser(); analyser.fftSize = samples.length;
      }
      context.resume().catch(stop);
    } catch { /* Visualization is optional; native playback remains independent. */ }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#play')) enable();
  }, { capture: true });
  document.addEventListener('keydown', event => { if (event.code === 'Space') enable(); }, { capture: true });
  audio.addEventListener('playing', start);
  for (const event of ['pause', 'emptied', 'ended', 'waiting', 'error']) audio.addEventListener(event, stop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); context?.suspend().catch(() => {}); } else start();
  });
  reduced.addEventListener('change', () => { canvas.hidden = unavailable(); if (reduced.matches) stop(); else start(); });
  new ResizeObserver(() => {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
  }).observe(canvas);
})();
