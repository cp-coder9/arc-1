// Feature: website-ui-redesign, Property 12
//
// Property-based tests for the Hero copy clamp helper (`clampCopy`) and the
// static `HERO_COPY` config. Validates Requirements 11.1, 11.4.

import fc from 'fast-check';
import {
  clampCopy,
  HERO_COPY,
  HEADLINE_LIMIT,
  SUBLINE_LIMIT,
} from '../copy';

const RUNS = { numRuns: 100 } as const;

describe('Property 12: Copy clamp', () => {
  // For any string and any limit, the clamped output length never exceeds the
  // effective limit (max(limit, 0) — a non-positive limit yields an empty
  // string). Validates Requirements 11.4.
  it('output length never exceeds max(limit, 0) for any string and limit', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (str, limit) => {
        const result = clampCopy(str, limit);
        expect(result.length).toBeLessThanOrEqual(Math.max(limit, 0));
      }),
      RUNS,
    );
  });

  // When the input is already within the limit, clampCopy returns it
  // unchanged. Validates Requirements 11.4.
  it('returns the input unchanged when it is already within the limit', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 500 }), (str, extra) => {
        // Choose a limit that is guaranteed to be >= the string length so the
        // input is always within bounds.
        const limit = str.length + extra;
        const result = clampCopy(str, limit);
        expect(result).toBe(str);
      }),
      RUNS,
    );
  });

  // HERO_COPY is the only primary marketing copy and must respect the headline
  // (<=60) and subline (<=160) character limits. Validates Requirements 11.1.
  it('HERO_COPY headline stays within 60 characters and subline within 160 characters', () => {
    expect(HEADLINE_LIMIT).toBe(60);
    expect(SUBLINE_LIMIT).toBe(160);
    expect(HERO_COPY.headline.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
    expect(HERO_COPY.subline.length).toBeLessThanOrEqual(SUBLINE_LIMIT);
  });
});
