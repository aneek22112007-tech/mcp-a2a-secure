import { useEffect } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const TILT_SELECTOR = '.kpi-card, .connect-card, .core-card';
const GLOW_SELECTOR = '.panel, .kpi-card, .connect-card, .core-card';
const MAX_TILT = 7;

/**
 * One delegated pointer listener for the whole console. Cards under the
 * pointer get a small perspective tilt and every panel gets a soft light
 * that follows the cursor. Both are written as CSS custom properties, so no
 * view re-renders. Disabled for touch input and for reduced motion.
 */
export function useDepth(): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    let tilted: HTMLElement | null = null;
    let lit: HTMLElement | null = null;

    const reset = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
      el.classList.remove('is-tilting');
    };

    const apply = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;

      const glow = target?.closest<HTMLElement>(GLOW_SELECTOR) ?? null;
      if (lit && lit !== glow) lit.classList.remove('is-lit');
      if (glow) {
        const r = glow.getBoundingClientRect();
        glow.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
        glow.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
        glow.classList.add('is-lit');
      }
      lit = glow;

      const tilt = target?.closest<HTMLElement>(TILT_SELECTOR) ?? null;
      if (tilted && tilted !== tilt) reset(tilted);
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const scale = tilt.classList.contains('connect-card') ? 0.35 : 1;
        tilt.style.setProperty('--rx', `${(-py * MAX_TILT * scale).toFixed(2)}deg`);
        tilt.style.setProperty('--ry', `${(px * MAX_TILT * scale).toFixed(2)}deg`);
        tilt.classList.add('is-tilting');
      }
      tilted = tilt;
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const onLeave = () => {
      reset(tilted);
      tilted = null;
      lit?.classList.remove('is-lit');
      lit = null;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (frame) window.cancelAnimationFrame(frame);
      onLeave();
    };
  }, [reduced]);
}
