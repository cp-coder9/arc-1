# Root landing deployment note

Date: 2026-05-18 09:32 UTC

Requested: use `arc-1/undercon` as the landing page when visitors go to `architex.co.za`.

## What was deployed

Prepared the static landing from `/mnt/e/arc-1/undercon/code.html` with production-safe adjustments:

- Replaced external Architex image references with local `logo.png`.
- Added SEO description metadata.
- Updated title to `Architex | Built Environment OS Initializing`.
- Made the hero heading responsive for mobile.
- Updated footer copyright to 2026.
- Changed footer links to the AI workspace and contact email.

Uploaded files:

- `/home/archite4/public_html/index.html`
- `/home/archite4/public_html/logo.png`
- `/home/archite4/public_html/.htaccess`
- `/home/archite4/public_html/architex.co.za/index.html`
- `/home/archite4/public_html/architex.co.za/logo.png`
- `/home/archite4/public_html/architex.co.za/.htaccess`

The existing AI app under `/home/archite4/public_html/architex.co.za/ai/` was not modified.

## Validation completed

Local Playwright validation passed for desktop and mobile:

- Title: `Architex | Built Environment OS Initializing`
- No missing local resources.
- No horizontal overflow.
- Required content present: `Protocol v0.8.8 Initializing`.

Live verification:

- `https://architex.co.za/architex.co.za/ai/` still loads the existing Built Environment OS app.
- `https://architex.co.za/architex.co.za/` is reachable and returns HTTP 200, but LiteSpeed is still serving a cached older `index.html` with:
  - `cache-control: public, max-age=86400`
  - `last-modified: Sun, 17 May 2026 13:52:18 GMT`
  - `content-length: 21248`
- FTP confirms the uploaded file at `/home/archite4/public_html/architex.co.za/index.html` is the new prepared file with title `Architex | Built Environment OS Initializing` and size 20705 bytes.

## Blocker for exact apex domain

`https://architex.co.za/` still returns a LiteSpeed 404 even after uploading `/home/archite4/public_html/index.html`.

This indicates the active vhost/document root for the apex domain `architex.co.za` is not currently mapped to the FTP-accessible `/home/archite4/public_html/` folder. FTP upload alone cannot correct this vhost mapping.

Observed DNS/host resolution:

- `architex.co.za`, `www.architex.co.za`, `test.architex.co.za`, and `ftp.architex.co.za` all resolve to `169.239.218.73`.
- The web server maps `test.architex.co.za` and `https://architex.co.za/architex.co.za/ai/` to accessible content.
- The apex `https://architex.co.za/` remains attached to a LiteSpeed default/missing vhost and returns 404.

## Human action needed

In cPanel or the hosting control panel, set the domain document root for `architex.co.za` and `www.architex.co.za` to one of the uploaded folders:

Preferred:

- `/home/archite4/public_html/architex.co.za`

Alternative:

- `/home/archite4/public_html`

Then purge LiteSpeed/cache for `architex.co.za`, or wait for the current `max-age=86400` cache to expire for the older mapped page.

After the vhost root is corrected, the uploaded under-construction landing should serve at `https://architex.co.za/`.
