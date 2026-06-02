import { describe, expect, it } from 'vitest';
import { buildUserActivityParams } from '../userActivity';

describe('buildUserActivityParams', () => {
  it('normalizes dashboard feature activity into Firebase-safe primitives', () => {
    expect(buildUserActivityParams({
      action: 'Open Feature',
      role: 'bep',
      feature: 'Drawing Checker',
      source: 'sidebar',
      target: 'drawing-checker',
      label: 'AI Drawing Checker',
    })).toEqual({
      action: 'open_feature',
      role: 'bep',
      feature: 'drawing_checker',
      source: 'sidebar',
      target: 'drawing-checker',
      label: 'ai_drawing_checker',
    });
  });

  it('keeps analytics payloads bounded and omits empty optional fields', () => {
    const params = buildUserActivityParams({
      action: ' '.repeat(4),
      role: null,
      feature: 'Very Long Feature Name '.repeat(10),
      source: 'keyboard_shortcut',
      target: '',
    });

    expect(params.action).toBe('unknown');
    expect(params.role).toBeUndefined();
    expect(params.target).toBeUndefined();
    expect(params.source).toBe('keyboard_shortcut');
    expect(params.feature).toHaveLength(80);
  });
});
