import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('static shared-hosting routing guard', () => {
  it('ships an Apache rewrite guard so API probes do not fall through to SPA HTML', () => {
    const htaccessPath = resolve(process.cwd(), 'public/.htaccess');
    expect(existsSync(htaccessPath)).toBe(true);

    const htaccess = readFileSync(htaccessPath, 'utf8');
    const apiGuardIndex = htaccess.indexOf('RewriteRule ^api(?:/|$) - [R=404,L]');
    const healthGuardIndex = htaccess.indexOf('RewriteRule ^health$ - [R=404,L]');
    const spaFallbackIndex = htaccess.indexOf('RewriteRule . /index.html [L]');

    expect(apiGuardIndex).toBeGreaterThanOrEqual(0);
    expect(healthGuardIndex).toBeGreaterThanOrEqual(0);
    expect(spaFallbackIndex).toBeGreaterThanOrEqual(0);
    expect(apiGuardIndex).toBeLessThan(spaFallbackIndex);
    expect(healthGuardIndex).toBeLessThan(spaFallbackIndex);
  });
});
