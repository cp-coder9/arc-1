/**
 * Bridge module: @jest/globals → vitest globals
 *
 * This file is resolved via the '@jest/globals' alias in vitest.config.ts.
 * It provides jest-compatible API using vitest's globally injected functions.
 *
 * IMPORTANT: Do NOT use `import/export from 'vitest'` here. That creates a
 * module resolution conflict in Vitest 4.x causing "Cannot read properties
 * of undefined (reading 'config')" errors in test files.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

// vitest injects these as globals when globals: true is set in config
export const describe = g.describe;
export const it = g.it;
export const test = g.test;
export const expect = g.expect;
export const beforeAll = g.beforeAll;
export const beforeEach = g.beforeEach;
export const afterAll = g.afterAll;
export const afterEach = g.afterEach;
export const vi = g.vi;
export const jest = g.vi;
