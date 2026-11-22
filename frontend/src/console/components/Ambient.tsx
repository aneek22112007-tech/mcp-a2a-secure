import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Decorative backdrop for the console: ember glows, a receding perspective
 * grid and a faint star field. It sits behind every view, never takes
 * pointer events and carries no data. Pointer parallax is off for touch
 * screens and for users who ask for reduced motion.
 */
export function Ambient() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div ref={ref} className="ember-ambient" aria-hidden>
      <div className="ember-glow ember-glow-a" />
      <div className="ember-glow ember-glow-b" />
      <div className="ember-glow ember-glow-c" />
      <div className="ember-stars" />
      <div className="ember-floor">
        <div className="ember-floor-plane">
          <div className="ember-floor-grid" />
        </div>
      </div>
      <div className="ember-horizon" />
      <div className="ember-vignette" />
    </div>
  );
}
