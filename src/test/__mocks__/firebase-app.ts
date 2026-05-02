// Mock for firebase/app — ESM-safe Jest stub
import { jest } from '@jest/globals';

export const initializeApp = jest.fn(() => ({}));
export const getApp = jest.fn(() => ({}));
export const getApps = jest.fn(() => []);
export const deleteApp = jest.fn();
export const registerVersion = jest.fn();
export const SDK_VERSION = '10.0.0';
