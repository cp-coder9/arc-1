import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: false,
    }],
  },
  // Intercept Firebase and other ESM-only packages before Jest tries to parse them.
  // Redirect to hand-crafted mocks so the ESM entry-points are never loaded by Jest's CJS runtime.
  moduleNameMapper: {
    // Path alias
    '^@/(.*)$': '<rootDir>/src/$1',
    // Firebase sub-packages → our manual mock
    '^firebase/firestore$': '<rootDir>/src/test/__mocks__/firebase-firestore.ts',
    '^firebase/auth$': '<rootDir>/src/test/__mocks__/firebase-auth.ts',
    '^firebase/app$': '<rootDir>/src/test/__mocks__/firebase-app.ts',
    '^firebase/storage$': '<rootDir>/src/test/__mocks__/firebase-storage.ts',
    '^firebase/analytics$': '<rootDir>/src/test/__mocks__/firebase-analytics.ts',
    // @firebase/* internal packages 
    '^@firebase/.*$': '<rootDir>/src/test/__mocks__/firebase-app.ts',
    // Stub static assets (CSS, images, SVG)
    '\\.(css|less|scss|svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/src/test/__mocks__/fileMock.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/test/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};

export default config;
