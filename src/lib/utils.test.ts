import { cn } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge tailwind classes properly', () => {
      expect(cn('flex', 'flex-col')).toBe('flex flex-col');
      expect(cn('flex', { 'flex-col': true })).toBe('flex flex-col');
    });
  });
});
