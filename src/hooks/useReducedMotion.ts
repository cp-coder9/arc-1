/**
 * useReducedMotion Hook
 *
 * Detects the user's prefers-reduced-motion media query preference and caches
 * the value in state to avoid re-computing on every render. This hook allows
 * components to respect accessibility preferences for users with vestibular
 * disorders or low-power devices that prefer minimized animations.
 *
 * Usage:
 *   const prefersReducedMotion = useReducedMotion();
 *   if (!prefersReducedMotion) {
 *     // Apply animations
 *   } else {
 *     // Skip animations (duration: 0)
 *   }
 *
 * Returns:
 *   boolean | null — true if user prefers reduced motion, false if they prefer
 *   animations, null if hook is still initializing (rare)
 *
 * Requirements:
 *   7.1 — Detect prefers-reduced-motion media query
 *   7.2 — Cache value in state to avoid re-computing on every render
 */

import { useState, useEffect } from 'react';

/**
 * Hook that detects and caches the user's prefers-reduced-motion preference.
 * 
 * Preconditions:
 *   - Hook is called during component render (not in event handlers)
 *   - Browser supports matchMedia API (all modern browsers)
 * 
 * Postconditions:
 *   - Returns true/false indicating user preference
 *   - Value is cached in state and doesn't change on re-render
 *   - Listens for media query changes and updates state if preference changes
 *   - Effect cleanup removes listener on unmount
 * 
 * @returns boolean | null — true if prefers reduced motion, false if prefers animations, null while initializing
 */
export function useReducedMotion(): boolean | null {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    // Create media query matcher for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Set initial value from current media query state
    setPrefersReducedMotion(mediaQuery.matches);

    // Create listener function to handle media query changes
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setPrefersReducedMotion(e.matches);
    };

    // Attach listener for media query changes (for when user changes OS settings)
    mediaQuery.addEventListener('change', handleChange);

    // Cleanup: remove listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

export default useReducedMotion;
