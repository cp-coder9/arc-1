/**
 * Shim for `import { describe, it, expect, vi, ... } from 'vitest'`
 *
 * Vitest 4.x exports raw @vitest/runner functions from 'vitest' that require
 * the runner context to be initialized. When globals: true is set, vitest
 * injects properly-bound versions as globals. This shim re-exports those
 * globals so that explicit `import { describe } from 'vitest'` statements
 * in test files work correctly.
 *
 * This file is registered as a resolve alias for 'vitest' in vitest.config.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

export const describe = g.describe;
export const it = g.it;
export const test = g.test;
export const expect = g.expect;
export const beforeAll = g.beforeAll;
export const beforeEach = g.beforeEach;
export const afterAll = g.afterAll;
export const afterEach = g.afterEach;
export const vi = g.vi;
export const suite = g.suite;
export const bench = g.bench;
export const onTestFailed = g.onTestFailed;
export const onTestFinished = g.onTestFinished;

// Re-export vi as vitest (named export used by some patterns)
export const vitest = g.vi;
