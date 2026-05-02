import { vi } from 'vitest';

if (!('unstable_mockModule' in vi)) {
  Object.defineProperty(vi, 'unstable_mockModule', {
    configurable: true,
    value: vi.mock,
  });
}

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi as jest,
} from 'vitest';
