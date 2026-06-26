# Task 6 Report: Migrate tools.html into SPA #view-tools

## Changes made to `c:\Users\yessw\Desktop\miaosite\index.html`

### 1. CSS (`#view-tools` prefixed style block)
- Added a new `<style>` block after the knowledge view CSS
- All 300+ lines of tools-specific CSS prefixed with `#view-tools`
- Covers: bento-grid layout, skill cards (including color variants), chat card, toolbar, file upload, input area, message bubbles, Markdown rendering, reader panel, prompt modal, template modals, responsive breakpoints
- Removed duplicate CSS for bg-glow, bg-noise, toast-container (already in base CSS or shared elements)

### 2. DOM (inserted into `#view-tools` div)
- Complete bento-grid with 9 skill cards (writing, translate, knowledge, excel, brainstorm, weekly, markdown, custom, summary) and central chat card
- Template management modal overlay
- Template edit modal overlay  
- Prompt modal overlay (displays full skill system prompts)
- Reader panel overlay (expand AI reply in full-screen)
- Toast container
- Excluded: nav-bar (already in shell), footer (already in index.html), bg elements (already in shell)

### 3. JavaScript (`initTools()` function + ViewManager.register)
All tools functionality wrapped in `window.initTools` and registered with `ViewManager.register('tools', initTools)`:

**KEPT from tools.html:**
- `ChatSync` — cloud conversation sync (pull/merge/push)
- `showToast()`, `showAuthOverlay()` — UI utilities
- `MiaositeAuth.mount()` with `onAuthChange` for chat sync
- `escHtml()`, `renderMarkdown()` — safe Markdown to HTML converter
- `streamAI()` — SSE streaming to `/api/ai-chat` with retry logic
- `selectSkill()`, skill card selection with visual indicators
- Chat dialog: `sendChatMessage()`, message bubbles, file upload, thinking status
- Chat history CRUD: `saveCurrentChat()`, `loadChatHistory()`, `newChatSession()`, etc.
- Prompt modal: `openPromptModal()`, `closePromptModal()`, `copyPromptText()`
- Template management: `openTemplatesModal()`, CRUD operations via `/api/prompts`
- Reader panel: `openReaderPanel()`, `closeReaderPanel()`, `copyReaderContent()`
- Export: `exportChat()` to copy or download Markdown
- GSAP entry animations for chat card and skill cards + ScrollTrigger batch for scroll reveal
- `FULL_SKILL_PROMPTS` data object (9 skill system prompts)
- ESC key listener for closing modals, click listener for closing menus

**REMOVED (duplicated in shared shell):**
- Theme initialization (already in shared scripts)
- Login toast from sessionStorage (already shared)
- Online count SSE/fallback polling (shared in ViewManager section)
- Weather check and raindrop overlay init (shared)
- GSAP bg-orb animations, nav-bar entry animation, nav-pill indicator animation (shared)
- Service worker registration (shared)
- React Auth script injection (shared at line 2671)
- Admin entry JWT check (shared)

### 4. `lib/prompts.js`
- This is a server-side CommonJS module (`module.exports = ...`), not usable as a static `<script>` tag
- The prompts are already inlined as `FULL_SKILL_PROMPTS` inside `initTools()`, matching the original tools.html structure

## Commit
```
4f34a17 feat: migrate tools view content into SPA
```

## Verification
- File size: 399.9 KB
- Body/HTML tags balanced
- `initTools` function present
- `ViewManager.register('tools', initTools)` present
- `#view-tools` div present with all DOM content
- No `console.log` in tools init section
- No references to `tools.html` in index.html
