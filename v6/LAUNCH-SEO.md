# V6: switching SEO on at launch

**TL;DR:** the preview is deliberately hidden from Google (`noindex`). At launch, flip **3 switches**, in this order. Ready-made `sitemap.xml` and `robots.txt` are in `launch/`.

| # | Switch | Where | What to do |
|---|---|---|---|
| 1 | **Remove noindex** | `index.html`, `polityka-prywatnosci.html`, `cookies.html` | Delete the line `<meta name="robots" content="noindex, follow">` (and the comment above it) |
| 2 | **Canonical + absolute URLs to the real domain** | same 3 files (canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD `@id`/`url`/`image`) | Replace `https://dmac2112.github.io/brand-preview/v6/` with `https://TWOJA-DOMENA.pl/` everywhere (one command below) |
| 3 | **sitemap.xml + robots.txt at the domain root** | `launch/sitemap.xml`, `launch/robots.txt` | Replace `TWOJA-DOMENA.pl`, copy both to the ROOT of the real domain, then submit the sitemap in Google Search Console |

```sh
# switch 2, run from the folder that will be published (macOS sed)
grep -rl 'dmac2112.github.io/brand-preview/v6/' --include='*.html' . \
  | xargs sed -i '' 's#https://dmac2112.github.io/brand-preview/v6/#https://TWOJA-DOMENA.pl/#g'
grep -rn 'dmac2112.github.io/brand-preview' --include='*.html' .   # must print nothing
```

## Why it is hidden now

- The page lives on a `github.io` preview with a **test picker** and an **archive version switcher**. Indexing it now would put a half-finished page and a temporary URL into Google, and the real domain would later have to compete with it.
- `noindex, follow`: Google may follow the links but will not list the pages.

## Also before launch (not SEO switches, but they break or leak if forgotten)

- ⚠️ **Remove the test picker** (`<details class="picker">` + its CSS and the `buildPicker` lines) and the version nav (`<nav class="mode">`, `../versions.js`).
- ⚠️ **Contact button** points to `../#kontakt` (the brand-preview root). Give it the real contact (e.g. `mailto:`), and fill the same e-mail into the privacy policy.
- ⚠️ `../projects-data.js` and `../versions.js` are loaded from the parent folder. If V6 becomes the domain root, move `projects-data.js` next to `index.html` and fix the path.
- **Legal placeholders**: every `[DO UZUPEŁNIENIA]` must be filled (list: `.overnight/legal-todo.md`). Do not launch with placeholders.
- **Hosting changes?** If the real domain is not on GitHub Pages, update the hosting/recipient/transfer parts of `polityka-prywatnosci.html` and `cookies.html` (logs section).
- **Business name**: once chosen, update `og:site_name`, JSON-LD `ProfessionalService.name`, the footer and the administrator block.
- **Analytics?** Only together with a consent banner that blocks it until opt-in (see the comment at the top of `index.html` `<head>`).
- Rebuild `og.jpg` if the hero copy changes: edit `.overnight/og/og-card.html`, run `node .overnight/og/render-assets.cjs` (also rebuilds favicons and `img/*.webp`).

## Already done (no action at launch)

- Polish `<title>` + meta description, one `h1`, heading order h1 > h2 > h3.
- Open Graph + Twitter card, `og.jpg` 1200x630.
- JSON-LD: `WebSite`, `Person`, `ProfessionalService` with the 4 services (no address, no area served, on purpose).
- Favicons: `favicon.svg` (follows system dark mode), `favicon-32.png`, `apple-touch-icon.png`; `theme-color` follows the page theme.
- Self-hosted font (`fonts/`, OFL) and Lenis (`vendor/`, MIT): no requests to Google Fonts or unpkg.
- Project screenshots as WebP (`img/`, 640w + 1200w, `srcset`, `width`/`height`, lazy).
