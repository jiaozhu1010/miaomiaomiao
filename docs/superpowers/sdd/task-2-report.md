# Task 2 Report: New index.html SPA Shell

**Status:** DONE

**Commit SHA:** 17a2208

**Commit message:** feat: create SPA shell with shared nav-bar and view container

**Line count of new index.html:** 142 lines (was 5722)

## What was done

- Replaced the 5722-line monolithic index.html with a 142-line SPA shell
- `<head>`: cache-busting script, favicon, knowledge lib CSS (highlight, KaTeX), base.css/auth.css/raindrop-overlay.css via dynamic document.write
- `<body data-active-view="home">`: shared background layers (bg-atmosphere with 4 orbs, bg-yellow-glow, bg-grid, bg-grain, tools-bg-glow, tools-bg-noise)
- Reader panel overlay (display:none by default)
- Shared `<nav class="nav-bar">` with brand, online badge, admin link, force-refresh button, nav-pill with 3 `<button data-view="...">` tabs, user button
- `<div class="view-container">` with 3 view panels: `#view-home` (active), `#view-knowledge`, `#view-tools`
- Shared Toast (`#toast` + `#toast-container`)
- Shared auth-root for React auth bundle
- Static script imports: GSAP, ScrollTrigger, weather-state, raindrop-fx, raindrop-overlay
- Dynamic script imports (cache-busted): miaosite-auth.js, React auth bundle
- ViewManager placeholder script block for Task 4

## Verification

- All nav-pill tabs are `<button data-view="...">` with `type="button"` (not `<a>` links)
- Home tab has `class="nav-pill-tab active"` and `aria-selected="true"`
- `#view-home` has `class="view-panel active"`; other panels have no active class
- Library scripts use static `src=`; auth uses dynamic `document.write`
- HTML is well-formed (all tags properly closed, 142 lines)

## Concerns

- The `style="display:none"` on `#reader-panel` triggers a CSS-lint warning but is intentional (the reader panel starts hidden by design, controlled by JS)
- The previous index.html content (barcode, OCR, weather, etc.) is now removed from git — it will be restored in Tasks 3/5/6 from git history
