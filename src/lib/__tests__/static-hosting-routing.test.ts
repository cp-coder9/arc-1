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

  it('builds the FTP upload bundle from dist with Apache dotfiles preserved', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    const bundleScriptPath = resolve(process.cwd(), 'scripts/build-static-upload-bundle.mjs');
    expect(packageJson.scripts?.['deploy:static:bundle']).toContain('scripts/build-static-upload-bundle.mjs');
    expect(existsSync(bundleScriptPath)).toBe(true);

    const bundleScript = readFileSync(bundleScriptPath, 'utf8');
    expect(bundleScript).toContain("const requiredDistFiles = ['index.html', '.htaccess'];");
    expect(bundleScript).toContain('cpSync(distDir, uploadDir');
    expect(bundleScript).toContain('architex-co-za-upload-bundle.tgz');
  });
});
