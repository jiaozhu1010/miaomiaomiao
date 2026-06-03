# Chat 页面舒适度焕新 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 chat.html 从三栏挤压布局重构为极简禅意居中单栏 + 温暖小窝配色，聊天区固定宽度不被挤压。

**Architecture:** 单文件改造 (chat.html, ~2497行)。CSS 变量层 → 背景/氛围层 → 布局结构层 → 组件配色层，自底向上逐层更新。HTML 结构调整 content-area 为居中三区（左留白+聊天+右留白）。不改任何 JS 逻辑。

**Tech Stack:** 纯 HTML/CSS/JS，无框架。CSS 变量体系 + Flexbox + Glassmorphism。

---

### Task 1: CSS 变量 — 温暖小窝配色

**Files:**
- Modify: `chat.html:11-66` (:root 变量块)

- [ ] **Step 1: 更新暖色系 CSS 变量**

找到 `:root` 中的暖色变量块（约第 51-66 行），替换为温暖小窝配色：

```css
/* ===== 落日暖橙配色 (猫咪模式) — 温暖小窝焕新 ===== */
--primary-color: #d49478;
--primary-dark: #b86840;
--primary-light: #e8c8b0;
--primary-bg: #fdf3e4;
--bg-color: #fef9f0;
--box-bg: #ffffff;
--text-color: #5d3a1a;
--muted-text: #a08c7a;
--soft-panel: rgba(255,250,245,0.55);
--soft-border: rgba(200,160,120,0.12);
--border-radius: var(--radius-lg);
--cat-pink: #d49478;
--code-blue: #4a90d9;
--code-dark: #1e1e2e;
```

**注意:** `--code-blue` 和 `--code-dark` 保持原值不变。

- [ ] **Step 2: 验证变量加载**

在浏览器打开 chat.html，打开 DevTools → Elements → Computed，确认 `--bg-color` 为 `#fef9f0`，`--primary-color` 为 `#d49478`。

- [ ] **Step 3: Commit**

---

### Task 2: 柔光背景球 — 更低更慢更淡

**Files:**
- Modify: `chat.html:87-138` (背景球 CSS + 动画 keyframes)

- [ ] **Step 1: 增大柔光球尺寸并降透明度**

找到 `.bg-orb` 相关样式（约 90-113 行），修改尺寸和颜色：

```css
.bg-orb--warm {
    width: 800px; height: 800px;
    background: radial-gradient(circle, rgba(220,150,100,0.22) 0%, transparent 70%);
    top: -15%; left: -10%; animation-name: orbDriftWarm; animation-duration: 22s;
}
.bg-orb--pink {
    width: 650px; height: 650px;
    background: radial-gradient(circle, rgba(200,160,120,0.18) 0%, transparent 70%);
    top: 50%; right: -12%; animation-name: orbDriftPink; animation-duration: 26s;
}
.bg-orb--blue {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(180,150,120,0.14) 0%, transparent 70%);
    bottom: -10%; left: 30%; animation-name: orbDriftBlue; animation-duration: 24s;
}
.bg-orb--cream {
    width: 550px; height: 550px;
    background: radial-gradient(circle, rgba(210,170,130,0.16) 0%, transparent 70%);
    top: 20%; left: 50%; animation-name: orbDriftCream; animation-duration: 28s;
}
```

- [ ] **Step 2: 减慢漂移动画速度**

找到 `@keyframes orbDriftWarm/Pink/Blue/Cream`（约 114-133 行），将 `animation-duration` 在上一步已更新为 CSS 变量。无需额外修改 keyframes 内部。

- [ ] **Step 3: 更新代码模式柔光球配色**

找到 `body.code-mode .bg-orb--*` 样式（约 142-153 行），保持不变（蓝色系代码模式不受影响）。

- [ ] **Step 4: 验证**

浏览器打开 chat.html，观察背景柔光球是否更大、更淡、移动更慢。

- [ ] **Step 5: Commit**

---

### Task 3: 头部精简 — 去掉猫耳朵和返回链接

**Files:**
- Modify: `chat.html:156-283` (header 相关 CSS)
- Modify: `chat.html:1082-1096` (header HTML)

- [ ] **Step 1: 精简 header CSS**

找到 `.chat-header` 样式（约 156-169 行），缩高度：

```css
.chat-header {
    position: relative; z-index: 100;
    background: rgba(255,255,255,0.4);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    padding: 10px 20px; text-align: center;
    border-bottom: 1px solid var(--soft-border);
    box-shadow: var(--shadow-sm);
    flex-shrink: 0;
    transition: background 0.4s ease, border-color 0.4s ease;
    display: flex; align-items: center; justify-content: center; gap: 12px;
}
```

- [ ] **Step 2: 删除猫耳朵 CSS**

删除 `.cat-ears`、`.cat-ear`、`.cat-ear::after` 全部样式（约 171-195 行）。

- [ ] **Step 3: 删除返回链接 CSS**

删除 `.back-link` 及其所有伪类/伪元素样式（约 205-232 行），以及 `body.code-mode .back-link` 样式。

- [ ] **Step 4: 精简 header h1 和 subtitle**

```css
.chat-header h1 {
    font-family: var(--font-display);
    font-size: calc(var(--text-lg) * var(--font-scale));
    font-weight: 800; color: var(--text-color);
    letter-spacing: -0.3px; margin: 0;
    cursor: pointer;
}
.chat-header h1:hover { opacity: 0.7; }
.chat-header .subtitle { display: none; }
```

- [ ] **Step 5: 更新模式切换样式（微调间距）**

`.mode-toggle-wrap` padding 改为 `padding: 0`（去掉上方多余间距）。

- [ ] **Step 6: 更新 header HTML**

找到 header HTML（约 1082-1096 行），替换为精简版：

```html
<header class="chat-header" id="header-el">
    <h1 id="header-title" onclick="window.location='/'" title="回喵码">🐱 和小橘聊天</h1>
    <div class="mode-toggle-wrap">
        <div class="mode-toggle" id="mode-toggle">
            <button class="mode-option active" data-mode="cat">🐱 猫咪</button>
            <button class="mode-option" data-mode="code">💡 认真</button>
        </div>
    </div>
    <button class="settings-btn" id="settings-btn" title="设置">⚙️</button>
</header>
```

- [ ] **Step 7: 更新代码模式 header 样式**

```css
body.code-mode .chat-header h1 { color: #1a3a5c; }
```

删除旧的 `body.code-mode .chat-header .subtitle` 规则（subtitle 已隐藏）。

- [ ] **Step 8: 验证**

浏览器中确认头部只显示标题 + 模式切换 + 设置齿轮，高度 ~48px。点击标题可跳转首页。

- [ ] **Step 9: Commit**

---

### Task 4: 布局重构 — content-area 三区结构

**Files:**
- Modify: `chat.html:285-378` (content-area, sidebar, toggle CSS)
- Modify: `chat.html:1098-1179` (content-area HTML)

这是最关键的步骤。需要重构 CSS 布局和 HTML 结构。

- [ ] **Step 1: 更新 .content-area**

```css
.content-area {
    flex: 1; display: flex; flex-direction: row; min-height: 0; overflow: hidden;
    position: relative;
}
/* 左侧留白区 */
.content-spacer { flex: 0 0 56px; position: relative; }
/* 中央聊天列 */
.chat-column {
    flex: 1; display: flex; flex-direction: column;
    max-width: 680px; margin: 0 auto; min-width: 0; overflow: hidden;
}
```

- [ ] **Step 2: 更新 sidebar-panel 为叠加层**

保持 `position: absolute`，更新配色：

```css
.sidebar-panel {
    position: absolute; top: 0; bottom: 0;
    width: var(--sw); min-width: var(--sw);
    background: rgba(255,250,245,0.72);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    display: flex; flex-direction: column;
    overflow: hidden; z-index: 15;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sidebar-panel-left {
    --sw: 240px; left: 0; transform: translateX(-100%);
    border-right: 1px solid var(--soft-border);
    box-shadow: 2px 0 20px rgba(0,0,0,0.06);
}
.sidebar-panel-left.open { transform: translateX(0); }
.sidebar-panel-right {
    --sw: 260px; right: 0; transform: translateX(100%);
    border-left: 1px solid var(--soft-border);
    box-shadow: -2px 0 20px rgba(0,0,0,0.06);
}
.sidebar-panel-right.open { transform: translateX(0); }
```

- [ ] **Step 3: 更新边缘标签样式**

```css
.sidebar-toggle {
    position: absolute; top: 16px;
    width: 22px; height: 72px;
    background: rgba(255,250,245,0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--soft-border);
    cursor: pointer; z-index: 20;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: var(--text-color); font-weight: 700;
    writing-mode: vertical-rl; letter-spacing: 2px;
    user-select: none; flex-shrink: 0;
    box-shadow: var(--shadow-sm);
    transition: background 0.2s, color 0.2s;
}
.sidebar-toggle:hover { background: rgba(255,250,245,0.75); color: var(--primary-color); }
.sidebar-toggle-left {
    left: 0; border-radius: 0 8px 8px 0;
}
.sidebar-toggle-right {
    right: 0; border-radius: 8px 0 0 8px;
}
```

注意：去掉 `.sidebar-toggle-left.open` 和 `.sidebar-toggle-right.open` 的 transform 位移 —— 标签不再随抽屉移动。

- [ ] **Step 4: 更新 history-item 和 prompt-item 配色**

```css
.history-item {
    padding: 10px 12px; margin-bottom: 6px;
    background: rgba(255,255,255,0.6); border: 1px solid var(--soft-border);
    border-radius: 10px; cursor: pointer;
    transition: all 0.2s; position: relative;
}
.history-item:hover { border-color: var(--primary-color); transform: translateX(3px); box-shadow: 0 2px 8px rgba(180,120,80,0.08); }
.history-item.active { border-color: var(--primary-color); background: var(--primary-bg); }
```

prompt-item 同样更新边框色。

- [ ] **Step 5: 更新 HTML 结构**

找到 content-area HTML（约 1098-1179 行），重构为三区结构：

```html
<div class="content-area" id="content-area">
    <!-- LEFT: Chat History (overlay) -->
    <aside class="sidebar-panel sidebar-panel-left" id="sidebar-panel-left">
        <div class="sidebar-header">
            <h3>💬 对话历史</h3>
            <div class="sidebar-header-actions">
                <button class="sidebar-new-btn" id="hist-new-btn" title="新建对话">+</button>
            </div>
        </div>
        <div class="sidebar-list" id="history-list"></div>
        <div class="sidebar-footer">
            <span class="sidebar-user" id="sidebar-user"></span>
            <button class="auth-logout-btn" id="sidebar-logout-btn">退出登录</button>
        </div>
    </aside>

    <!-- LEFT SPACER + Edge Tab -->
    <div class="content-spacer">
        <button class="sidebar-toggle sidebar-toggle-left" id="sidebar-toggle-left">历史</button>
    </div>

    <!-- CENTER: Chat Column -->
    <div class="chat-column" id="chat-column">
        <div class="chat-wrapper" id="chat-container">
            <div class="welcome-card" id="welcome-card">
                <div class="big-icon">🐱</div>
                <p id="welcome-text">喵呜~ 你好呀铲屎官！<br>本喵是<strong>小橘</strong>，站长养的小猫咪喵~<br>有什么想问的嘛？本喵什么都知道一点点喵~ 🐾</p>
                <div class="tips" id="welcome-tips">
                    <span>今天天气</span><span>写代码</span><span>讲笑话</span><span>猫咪冷知识</span>
                </div>
            </div>
        </div>
        <div class="typing-bar">
            <div class="typing-indicator" id="typing-indicator">
                <span class="typing-text-wrap">
                    <span class="phase-icon" id="phase-icon">🤔</span>
                    <span id="typing-text">小橘正在思考</span>
                    <span class="elapsed-time" id="elapsed-time"></span>
                </span>
                <span class="typing-dots"><span></span><span></span><span></span></span>
                <span>🐾</span>
            </div>
        </div>
        <div class="input-area">
            <div class="input-wrapper">
                <input type="file" id="file-input" multiple accept="image/*,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.scss,.vue,.json,.xml,.yaml,.yml,.toml,.md,.txt,.log,.sql,.sh,.bat" hidden>
                <div class="input-row">
                    <div class="input-toggles">
                        <button class="toggle-btn web-search" id="toggle-web-search" title="网页搜索">🌐</button>
                        <button class="toggle-btn deep-think" id="toggle-deep-think" title="深度思考">🧠</button>
                    </div>
                    <div class="file-previews" id="file-previews"></div>
                    <div class="textarea-wrap">
                        <textarea id="chat-input" placeholder="跟小橘说点什么喵..." autocomplete="off" maxlength="2000" rows="1"></textarea>
                        <button class="expand-btn" id="expand-btn" title="展开输入框">↕</button>
                    </div>
                </div>
                <button class="btn-attach" id="btn-attach" title="上传文件">📎</button>
                <button class="send-btn" id="send-btn" title="发送">➤</button>
            </div>
        </div>
    </div>

    <!-- RIGHT SPACER + Edge Tab -->
    <div class="content-spacer">
        <button class="sidebar-toggle sidebar-toggle-right" id="sidebar-toggle-right">提示词</button>
    </div>

    <!-- RIGHT: Prompts (overlay) -->
    <aside class="sidebar-panel sidebar-panel-right" id="sidebar-panel-right">
        <div class="sidebar-header">
            <h3>📝 我的提示词</h3>
            <div class="sidebar-header-actions">
                <button class="sidebar-new-btn" id="prompt-new-btn" title="新建提示词">+</button>
            </div>
        </div>
        <div class="sidebar-list" id="prompt-list"></div>
    </aside>

    <!-- Mobile buttons (hidden on desktop) -->
    <button class="mobile-sidebar-btn mobile-sidebar-btn-left" id="mobile-hist-btn" style="display:none;">💬</button>
    <button class="mobile-sidebar-btn mobile-sidebar-btn-right" id="mobile-prompt-btn" style="display:none;">📝</button>
</div>
```

- [ ] **Step 6: 更新 main-layout 引用**

在 JS 中搜索 `main-layout`，检查是否有 JS 代码引用旧的结构 ID。将 `main-layout` 引用改为 `chat-column`。

需要搜索的关键词: `main-layout`, `getElementById('main-layout')`

- [ ] **Step 7: 更新 JS 中 sidebar-toggle 的 transform 逻辑**

搜索 JS 中引用 `sidebar-toggle-left` 和 `sidebar-toggle-right` 的部分，去掉 `.open` 状态下的 translateX 位移逻辑（标签不再随抽屉移动）。

- [ ] **Step 8: 验证**

浏览器中确认：聊天区居中且 max-width 680px，两侧各有 56px 留白。点击边缘标签，抽屉从边缘滑出叠加在留白区上方，聊天区不动。

- [ ] **Step 9: Commit**

---

### Task 5: 聊天区和消息气泡配色更新

**Files:**
- Modify: `chat.html:438-597` (chat-wrapper, message bubbles, welcome card)

- [ ] **Step 1: 更新 chat-wrapper**

```css
.chat-wrapper {
    flex: 1; width: 100%;
    padding: var(--space-lg) var(--space-lg) var(--space-xl);
    display: flex; flex-direction: column; gap: var(--msg-gap);
    overflow-y: auto; min-height: 0;
}
```

（去掉原有的 `max-width: 760px; margin: 0 auto;` — 宽度由父级 `.chat-column` 控制）

- [ ] **Step 2: 更新 AI 消息气泡**

```css
.message.ai .bubble {
    background: rgba(255,255,255,0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(200,160,120,0.08);
    border-top-left-radius: 4px;
    color: var(--text-color);
    box-shadow: var(--shadow-sm);
}
.message.ai .avatar { background: rgba(200,160,120,0.12); box-shadow: 0 2px 8px rgba(180,120,80,0.1); }
```

- [ ] **Step 3: 更新用户消息气泡**

```css
.message.user .bubble {
    background: linear-gradient(135deg, #d49478, #c47a5a);
    border-top-right-radius: 4px; color: #fff;
    box-shadow: 0 2px 12px rgba(180,120,80,0.2);
}
.message.user .avatar {
    background: linear-gradient(135deg, #d49478, #c47a5a);
    box-shadow: 0 2px 8px rgba(180,120,80,0.2); color: #fff;
}
```

- [ ] **Step 4: 更新欢迎卡片**

```css
.welcome-card {
    background: rgba(255,250,245,0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--soft-border);
    border-radius: var(--border-radius); padding: 24px; text-align: center;
    max-width: 90%; align-self: center; margin-top: 30px;
}
.welcome-card p { color: #7a5a3a; font-size: 14.5px; line-height: 1.7; margin: 0; }
.welcome-card .tips span {
    display: inline-block; background: rgba(200,160,120,0.08);
    border: 1px solid var(--soft-border); border-radius: 12px;
    padding: 3px 10px; cursor: pointer; transition: background 0.2s;
}
.welcome-card .tips span:hover { background: rgba(200,160,120,0.18); }
```

- [ ] **Step 5: 验证**

浏览器确认气泡颜色为暖杏调，代码模式下蓝色系保持原样。

- [ ] **Step 6: Commit**

---

### Task 6: 输入区配色和布局更新

**Files:**
- Modify: `chat.html:600-763` (input area CSS)

- [ ] **Step 1: 更新 input-area 背景**

```css
.input-area {
    background: rgba(255,250,245,0.4);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-top: 1px solid var(--soft-border);
    padding: 12px 0;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    box-shadow: 0 -2px 16px rgba(0,0,0,0.03);
    z-index: 10; flex-shrink: 0; position: relative;
    transition: background 0.4s ease, border-color 0.4s ease;
}
```

- [ ] **Step 2: 更新 input-wrapper 居中**

```css
.input-wrapper { max-width: 680px; margin: 0 auto; display: flex; gap: 8px; align-items: flex-end; padding: 0 8px; }
```

- [ ] **Step 3: 更新 textarea 配色**

```css
.input-row textarea {
    width: 100%;
    border: 1.5px solid rgba(200,160,120,0.12);
    border-radius: var(--radius-xl);
    padding: 12px 44px 12px 18px;
    font-size: calc(var(--text-base) * var(--font-scale)); outline: none;
    background: rgba(255,255,255,0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: var(--text-color);
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
    font-family: var(--font-body); resize: none;
    min-height: 46px; max-height: 120px; line-height: 1.55;
    overflow-y: auto; scrollbar-width: none;
}
.input-row textarea:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 4px rgba(200,160,120,0.08);
    background: rgba(255,255,255,0.7);
}
.input-row textarea::placeholder { color: #c4b5a8; font-style: italic; }
```

- [ ] **Step 4: 更新 toggle 按钮配色**

```css
.toggle-btn {
    width: 28px; height: 28px; border-radius: 50%; border: none;
    background: rgba(200,160,120,0.06); color: var(--muted-text);
    cursor: pointer; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
}
.toggle-btn:hover { background: rgba(200,160,120,0.12); color: var(--primary-color); transform: scale(1.1); }
.toggle-btn.active { background: rgba(200,160,120,0.15); color: var(--primary-color); box-shadow: 0 0 0 3px rgba(200,160,120,0.12); }
```

- [ ] **Step 5: 更新 send-btn 配色**

```css
.send-btn {
    width: 40px; height: 40px;
    border-radius: 50%; border: none;
    background: linear-gradient(135deg, #d49478, #c47a5a);
    color: #fff;
    font-size: 16px; cursor: pointer; flex-shrink: 0;
    box-shadow: 0 3px 0 #a06040, 0 4px 12px rgba(180,120,80,0.3);
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex; align-items: center; justify-content: center;
    align-self: flex-end; margin-bottom: 1px;
}
.send-btn:hover {
    transform: translateY(-2px) scale(1.06);
    box-shadow: 0 5px 0 #a06040, 0 8px 20px rgba(180,120,80,0.35);
}
.send-btn:active { transform: translateY(2px) scale(0.95); box-shadow: 0 1px 0 #a06040; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: 0 2px 0 #a06040; filter: grayscale(15%); }
```

- [ ] **Step 6: 更新 attach 按钮**

```css
.btn-attach {
    width: 36px; height: 36px;
    border-radius: 50%;
    border: 2px dashed #d4c0a8;
    background: rgba(255,250,245,0.6);
    font-size: 16px; cursor: pointer; flex-shrink: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; align-items: center; justify-content: center;
    color: #b8a088;
    margin-bottom: 2px;
}
.btn-attach:hover {
    border-color: var(--primary-color); border-style: solid;
    background: rgba(210,150,120,0.12); color: #c47a5a;
    transform: scale(1.08);
    box-shadow: 0 2px 8px rgba(180,120,80,0.1);
}
```

- [ ] **Step 7: 验证**

浏览器确认输入区居中且同聊天区宽度，配色为暖杏调。

- [ ] **Step 8: Commit**

---

### Task 7: 打字指示器、思考卡片等组件配色更新

**Files:**
- Modify: `chat.html:511-580` (typing indicator)
- Modify: `chat.html:970-1019` (thinking card, search citation)

- [ ] **Step 1: 更新 typing indicator 配色**

```css
.typing-indicator {
    background: rgba(255,250,245,0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--soft-border);
    border-top-left-radius: 4px;
}
.typing-dots span { background: #d4b088; }
.typing-dots span:nth-child(2) { background: #c49868; }
.typing-dots span:nth-child(3) { background: #d49478; }
```

`@keyframes thinkingPulse` 中的边框色更新:
```css
@keyframes thinkingPulse {
    0%, 100% { border-color: rgba(200,160,120,0.12); box-shadow: 0 2px 12px rgba(180,120,80,0.04); }
    50% { border-color: rgba(200,160,120,0.25); box-shadow: 0 2px 18px rgba(180,120,80,0.1); }
}
```

- [ ] **Step 2: 更新 thinking-card 配色**

```css
.thinking-card {
    background: rgba(200,160,120,0.04);
    border: 1px solid rgba(200,160,120,0.08);
    border-left: 3px solid var(--primary-color);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-sm);
    overflow: hidden;
    animation: thinkSlideIn 0.3s ease-out;
    max-width: 88%; align-self: flex-start;
}
.thinking-header {
    padding: 8px 12px; display: flex; align-items: center; gap: 6px;
    cursor: pointer; user-select: none; font-size: var(--text-xs);
    color: #b86840; font-weight: 600;
}
```

- [ ] **Step 3: 更新流式光标颜色**

```css
.msg-text.streaming::after { color: #d49478; }
```

- [ ] **Step 4: 更新 code mode typing indicator 颜色**

保持蓝色系不变（`body.code-mode .typing-indicator` 等已在现有代码中正确定义）。

- [ ] **Step 5: Commit**

---

### Task 8: 响应式更新

**Files:**
- Modify: `chat.html:773-814` (responsive CSS)

- [ ] **Step 1: 更新 ≤768px 媒体查询**

```css
@media (max-width: 768px) {
    .chat-header h1 { font-size: 17px; }
    .chat-header { padding: 8px 12px; gap: 8px; }
    .chat-wrapper { padding: 10px 8px 16px; }
    .message { max-width: 93%; }
    .content-spacer { flex: 0 0 0; }
    .chat-column { max-width: 100%; }
    .input-wrapper { max-width: 100%; }

    /* Sidebars become overlays */
    .sidebar-toggle { display: none; }
    .sidebar-panel {
        position: absolute; top: 0; bottom: 0; z-index: 25;
        width: 260px !important; min-width: 260px !important;
        transition: transform 0.3s ease;
    }
    .sidebar-panel-left  { left: 0; transform: translateX(-100%); border-right: 2px solid #e8c8b0; }
    .sidebar-panel-right { right: 0; transform: translateX(100%); border-left: 2px solid #e8c8b0; }
    .sidebar-panel.open { width: 260px !important; min-width: 260px !important; }
    .sidebar-panel-left.open  { transform: translateX(0); }
    .sidebar-panel-right.open { transform: translateX(0); }

    /* Mobile floating toggle buttons */
    .mobile-sidebar-btn {
        position: absolute; top: 10px; width: 34px; height: 34px;
        border-radius: 50%; border: none; cursor: pointer; z-index: 30;
        font-size: 16px; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    .mobile-sidebar-btn-left  { left: 8px; background: linear-gradient(135deg, #e8c8b0, #d4a888); color: #5d3a1a; }
    .mobile-sidebar-btn-right { right: 8px; background: linear-gradient(135deg, #e8c8b0, #d4a888); color: #5d3a1a; }
}
```

- [ ] **Step 2: 更新 ≤480px 媒体查询 (保持原样，微调配色)**

```css
@media (max-width: 480px) {
    .message { max-width: 95%; }
    .bubble { font-size: 13.5px; padding: 8px 12px; }
    .avatar { width: 28px; height: 28px; font-size: 16px; }
    .sidebar-panel { width: 85vw !important; min-width: 85vw !important; }
    .sidebar-panel.open { width: 85vw !important; min-width: 85vw !important; }
}
```

- [ ] **Step 3: Commit**

---

### Task 9: JS 适配 — ID 引用更新

**Files:**
- Modify: `chat.html` JS 部分 (搜索和替换 ID 引用)

- [ ] **Step 1: 搜索所有 `main-layout` 引用**

用 Grep 搜索 JS 中 `main-layout` 的引用，替换为 `chat-column`。

已知引用: `getElementById('main-layout')` → `getElementById('chat-column')`

- [ ] **Step 2: 搜索所有 `sidebar-toggle-left` 和 `sidebar-toggle-right` 的 JS 引用**

检查是否有 JS 动态修改标签 transform 的逻辑。在新设计中标签不再 translateX，需要去掉相关代码。

搜索关键词: `sidebar-toggle-left`, `sidebar-toggle-right`, `.open`

- [ ] **Step 3: 验证所有 JS 交互**

逐项测试：
- 模式切换 (猫咪 ↔ 认真)
- 边缘标签展开/收起抽屉
- 发送消息
- 文件上传
- 对话历史 CRUD
- 提示词 CRUD
- 设置面板
- 搜索/思考开关
- 展开输入框
- 欢迎卡片提示词点击

- [ ] **Step 4: Commit**

---

### Task 10: 最终验证和清理

**Files:**
- Modify: `chat.html` (全文件)

- [ ] **Step 1: 全量功能验证清单**

- [ ] 聊天区宽度固定居中，不被任何面板挤压
- [ ] 左抽屉 (历史) 打开/关闭，聊天区位置不变
- [ ] 右抽屉 (提示词) 打开/关闭，聊天区位置不变
- [ ] 温暖小窝配色整体协调
- [ ] 代码模式切换正常，蓝色系不受影响
- [ ] AI 消息气泡：暖杏调毛玻璃
- [ ] 用户消息气泡：暖杏橘渐变
- [ ] 打字指示器动画正常
- [ ] 柔光球漂移更慢更淡
- [ ] 头部精简（无猫耳朵、无返回链接）
- [ ] 输入区居中同聊天区宽度
- [ ] 手机端 (<768px) 布局正常，留白消失
- [ ] 设置面板所有开关正常工作
- [ ] 认证弹窗正常
- [ ] 所有 toast 正常

- [ ] **Step 2: 清理死代码**

搜索并删除不再使用的 CSS 样式：`.cat-ears`, `.cat-ear`, `.cat-ear::after`, `.back-link`, `.back-link:hover`, `.back-link::after`, `.sidebar-toggle-left.open`, `.sidebar-toggle-right.open` 的旧 transform 规则。

- [ ] **Step 3: 格式检查**

确保 CSS 缩进一致，无多余空行，注释清晰。

- [ ] **Step 4: Final commit**

---

## 验证命令

```bash
# 语法检查 (无框架，直接浏览器验证)
# 启动本地服务器
node server.js
# 浏览器打开 http://localhost:3000/chat.html
# 打开 DevTools → 检查 Computed CSS 变量
# 测试所有交互
```
