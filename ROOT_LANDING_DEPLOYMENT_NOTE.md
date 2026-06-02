# Root landing deployment note

Date: 2026-05-18 10:20 UTC

Requested: use `arc-1/undercon` as the public landing page when visitors go to `architex.co.za`, while leaving the production app on `test.architex.co.za` / `/architex.co.za/ai/` intact.

## What was deployed

Prepared the static landing from `/mnt/e/arc-1/undercon/code.html` with production-safe adjustments:

- Replaced the external Architex image reference with an embedded/local logo asset so the apex page does not depend on a third-party image URL.
- Added SEO description metadata.
- Updated title to `Architex | Built Environment OS Initializing`.
- Made the hero heading responsive for mobile.
- Updated footer copyright to 2026.
- Changed footer links to the AI workspace and contact email.

## Hosting/root mapping resolution

cPanel confirmed the active domain roots are:

- `architex.co.za`: `/home/archite4/public_html`
- `test.architex.co.za`: `/home/archite4/public_html/architex.co.za/ai`

The earlier FTP upload was landing in a jailed/ambiguous FTP root and did not create a visible `index.html` in the real cPanel File Manager root. The vhost mapping was already correct, but the real `/home/archite4/public_html/index.html` was missing, which is why the apex domain returned the LiteSpeed 404.

Resolution applied through authenticated cPanel File Manager API:

- Wrote `/home/archite4/public_html/index.html` with the prepared under-construction landing.
- Wrote `/home/archite4/public_html/.htaccess` with `DirectoryIndex index.html`, no directory listing, and no-cache/security headers.
- Embedded the logo into `index.html` as a data URL to avoid binary upload and cache mismatch problems.
- Left `/home/archite4/public_html/architex.co.za/ai/` untouched.

## Validation completed

Local Playwright validation passed for the prepared landing before upload:

- Title: `Architex | Built Environment OS Initializing`.
- No missing local resources.
- No horizontal overflow.
- Required content present: `Protocol v0.8.8 Initializing`.

Live verification after cPanel File Manager deployment passed:

- `https://architex.co.za/` returns HTTP 200 and serves the under-construction landing.
- `https://www.architex.co.za/` returns HTTP 200 and serves the under-construction landing.
- `https://architex.co.za/index.html` returns HTTP 200 and serves the under-construction landing.
- Desktop viewport: no missing resources, no horizontal overflow, required boot-sequence content present.
- Mobile viewport: no missing resources, no horizontal overflow, required boot-sequence content present.
- `https://test.architex.co.za/` still returns HTTP 200 and serves the Built Environment OS app.

## Current status

Resolved. No human cPanel/vhost action is currently required for the apex landing.

Remaining separate operational note: the repository branch still has local commits and generated/reference files that are not pushed to a remote Git repository. The production web files are deployed independently through hosting upload/cPanel, not through Git push.
