'use client';

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

let registered = false;

/** Register the @gsap/react integration once. Idempotent + SSR-safe. */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(useGSAP);
  registered = true;
}

/**
 * True when animations should be skipped: the user requested reduced motion,
 * or we are in a non-browser / test environment without `matchMedia`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, useGSAP };
