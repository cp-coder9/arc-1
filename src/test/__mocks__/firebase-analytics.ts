// Mock for firebase/analytics — Jest stub to avoid ESM parse errors
import { jest } from '@jest/globals';
export const getAnalytics = jest.fn(() => ({}));
export const logEvent = jest.fn();
export const setUserId = jest.fn();
export const setUserProperties = jest.fn();
export const isSupported = jest.fn(() => Promise.resolve(false));
