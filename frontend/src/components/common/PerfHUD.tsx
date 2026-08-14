import React, { useEffect, useRef, useState } from 'react';

interface Sample {
  fps: number;
  p50: number;
  p95: number;
  worst: number;
  longTasks: number;
  renderer: string;
}

/**
 * Diagnostic overlay. Reports real frame pacing from inside whatever runtime the app is
 * hosted in, so WebView2 behaviour can be compared against a browser directly rather
 * than inferred. Toggle with F8.
 */
export const PerfHUD: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [sample, setSample] = useState<Sample>({
    fps: 0,
    p50: 0,
    p95: 0,
    worst: 0,
    longTasks: 0,
    renderer: 'probing…',
  });

  const framesRef = useRef<number[]>([]);
  const longTaskRef = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F8') setVisible((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Identify the active graphics backend. A software renderer string here is the
  // difference between "the CSS is heavy" and "nothing is being accelerated".
  useEffect(() => {
    let renderer = 'unknown';
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') ||
        canvas.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) {
        renderer = 'NO WEBGL (software)';
      } else {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = dbg
          ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
          : String(gl.getParameter(gl.RENDERER));
      }
    } catch {
      renderer = 'probe failed';
    }
    setSample((s) => ({ ...s, renderer }));
  }, []);

  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        longTaskRef.current += list.getEntries().length;
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      observer = null;
    }

    let raf = 0;
    let last = performance.now();
    let lastReport = last;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      framesRef.current.push(delta);

      if (now - lastReport >= 500) {
        const deltas = framesRef.current.slice().sort((a, b) => a - b);
        if (deltas.length > 0) {
          const p = (q: number) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))];
          const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          setSample((s) => ({
            ...s,
            fps: Math.round(1000 / mean),
            p50: Math.round(p(0.5) * 10) / 10,
            p95: Math.round(p(0.95) * 10) / 10,
            worst: Math.round(deltas[deltas.length - 1] * 10) / 10,
            longTasks: longTaskRef.current,
          }));
        }
        framesRef.current = [];
        lastReport = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  if (!visible) return null;

  const bad = sample.p95 > 20;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 99999,
        pointerEvents: 'none',
        font: '11px/1.45 ui-monospace, Menlo, Consolas, monospace',
        color: '#fff',
        background: 'rgba(0,0,0,0.82)',
        border: `1px solid ${bad ? '#ff5f5f' : '#3ddc84'}`,
        borderRadius: 8,
        padding: '7px 10px',
        whiteSpace: 'pre',
      }}
    >
      {`FPS      ${sample.fps}
p50      ${sample.p50}ms
p95      ${sample.p95}ms
worst    ${sample.worst}ms
longtask ${sample.longTasks}
GPU      ${sample.renderer.slice(0, 46)}
DPR      ${window.devicePixelRatio}
[F8 to hide]`}
    </div>
  );
};

export default PerfHUD;
