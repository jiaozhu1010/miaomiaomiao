# SPA 整合设计：三页合一 + GSAP 电影级过渡

> 状态：待审阅 | 日期：2026-06-24 | 关联：index.html / knowledge.html / tools.html

## 目标

将 index.html（喵码条码+OCR）、knowledge.html（知识库 Wiki）、tools.html（AI 工具箱）三个独立页面整合为一个单页应用，消除 ~800 行重复代码，实现以 GSAP 驱动的 Apple 风格缩放位移过渡动画。

## 决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 过渡引擎 | GSAP Timeline（非 View Transitions API） | 主人选择视觉表现力优先 |
| 动画风格 | 缩放位移（Apple 风格） | 以 nav-pill 为 transform-origin 的空间连续性 |
| URL 策略 | 单一 URL（不改变地址栏） | 纯状态切换，刷新回首页 |
| JS 初始化 | 懒初始化 | 首屏只加载当前视图逻辑 |

---

## 架构

```
index.html (唯一入口)
├── nav.nav-bar (固定顶部，不随视图切换)
│   ├── .nav-brand (logo + 标题)
│   └── .nav-actions
│       ├── .online-badge
│       ├── .nav-pill (3 个 tab button，data-view 属性)
│       └── .btn-user
│
├── .view-container (过渡容器)
│   ├── #view-home.active     ← 喵码条码 + OCR（原 index.html 内容）
│   ├── #view-knowledge       ← 知识库 Wiki（原 knowledge.html 内容）
│   └── #view-tools           ← AI 工具箱（原 tools.html 内容）
│
├── .bg-atmosphere (共享背景层，跟随视图切换 class)
├── .bg-overlay 层 (bg-grid, bg-grain 等)
│
├── #auth-root (共享 auth 模块)
└── Toast container (共享)
```

### 视图面板

每个 `#view-*` 是 `.view-panel` div，内部保留原有完整的页面 DOM 结构：

- `#view-home`：`.main-layout` 三栏 grid → 天气侧边栏 + 条码主区 + OCR/工具右侧栏
- `#view-knowledge`：`.main-layout` 两栏 grid → 分类侧边栏 + 文章列表/详情/编辑器 + 教程模式
- `#view-tools`：`.bento-grid` 五列 Bento 宫格 → 9 个 skill-card + 1 个 chat-card

### 共享模块（消除重复）

| 模块 | 之前 | 之后 |
|------|------|------|
| nav-bar HTML | 4 处完全重复 | 1 处 |
| GSAP + ScrollTrigger 导入 | 3 次重复导入 | 1 次 |
| auth 集成（auth-root + miaosite-auth.js） | 3 处 | 1 处 |
| 天气/雨滴初始化 | 3 处完全相同的 ~30 行 | 1 处 |
| 在线人数 SSE | 3 处 | 1 处 |
| GSAP nav-pill 指示器动画 | 3 处 ~150 行 | 1 处 |
| GSAP matchMedia 基础设置 | 3 处 ~100 行 | 1 处 |

---

## 过渡动画系统

### 时序

```
时间轴:   0ms         150ms     250ms         400ms
          ├───────────┼─────────┼─────────────┤
旧视图:   缩小 + 淡出 ──────────┤
          scale 1→0.92
          opacity 1→0

新视图:              ┌── 放大 + 淡入 ──────────┤
                     scale 0.95→1
                     opacity 0→1

重叠区:           ├──┤ 60ms
```

### GSAP Timeline

```js
function animateViewTransition(fromView, toView, originX, originY) {
  // 设置 transform-origin 为 nav-pill 激活 tab 中心
  gsap.set([fromView, toView], {
    transformOrigin: `${originX}px ${originY}px`
  });

  const tl = gsap.timeline({
    onComplete: () => {
      gsap.set([fromView, toView], { clearProps: 'transform,opacity' });
      fromView.classList.remove('active', 'leaving');
      toView.classList.add('active');
    }
  });

  tl.to(fromView, {
    scale: 0.92,
    opacity: 0,
    duration: 0.25,
    ease: 'power2.in',
  }, 0);

  tl.fromTo(toView, {
    scale: 0.95,
    opacity: 0,
  }, {
    scale: 1,
    opacity: 1,
    duration: 0.3,
    ease: 'expo.out',
  }, 0.15);

  return tl;
}
```

### transform-origin 计算

每次过渡前基于 nav-pill 中当前激活 tab 的屏幕坐标计算缩放中心：

```js
function getTransitionOrigin() {
  const activeTab = document.querySelector('.nav-pill-tab.active');
  if (!activeTab) return { x: window.innerWidth / 2, y: 60 }; // fallback
  const rect = activeTab.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}
```

### 背景过渡

```js
// 背景层同步过渡（更平缓的 ease）
tl.to('.bg-atmosphere', { opacity: 0, duration: 0.18 }, 0);
tl.fromTo('.bg-atmosphere', { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.18);
```

### prefers-reduced-motion

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReduced) {
  // 跳过动画，直接切换
  fromView.classList.remove('active');
  toView.classList.add('active');
  return;
}
```

---

## ViewManager 路由系统

### API

```js
const ViewManager = {
  current: 'home',           // 当前视图名
  views: {},                 // { home: el, knowledge: el, tools: el }
  initialized: new Set(),    // 已完成 JS 初始化的视图
  isTransitioning: false,    // 过渡锁

  switchTo(name),            // 入口：切换视图
  initView(name),            // 懒初始化目标视图的 JS 逻辑
  animate(from, to),         // 执行 GSAP 过渡
};
```

### 切换流程

```
switchTo('knowledge')
  ├─ 检查 isTransitioning（是→return）
  ├─ 检查 name === current（是→return）
  ├─ isTransitioning = true
  ├─ 检查 initialized.has(name)（否→initView(name)）
  ├─ emit('view:willLeave', current)
  │   └─ 当前视图保存滚动位置、暂停轮询等
  ├─ animate(current, name)
  │   ├─ 计算 transformOrigin
  │   ├─ fromView + .leaving class
  │   ├─ toView 解除 display:none + .entering class
  │   ├─ GSAP timeline 执行
  │   └─ onComplete: 清理 class，ScrollTrigger.refresh()
  ├─ current = name
  ├─ emit('view:didEnter', name)
  │   └─ 新视图恢复轮询、刷新布局相关动画等
  └─ isTransitioning = false
```

### 导航绑定

nav-pill 从 `<a href>` 改为 `<button data-view>`：

```html
<button data-view="knowledge" class="nav-pill-tab" aria-selected="false">
  <span class="nav-pill-icon">📚</span>
  <span class="nav-pill-label">知识库</span>
</button>
```

```js
document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => ViewManager.switchTo(btn.dataset.view));
});
```

### 键盘导航

```js
document.addEventListener('keydown', (e) => {
  if (e.key === '1') ViewManager.switchTo('knowledge');
  if (e.key === '2') ViewManager.switchTo('home');
  if (e.key === '3') ViewManager.switchTo('tools');
});
```

---

## CSS 架构

### 视图显隐

```css
.view-panel {
  display: none;
}
.view-panel.active,
.view-panel.leaving,
.view-panel.entering {
  display: block; /* 或 grid / flex，由各视图覆盖 */
}

.view-panel:not(.active):not(.leaving):not(.entering) {
  content-visibility: auto;          /* 非活跃视图跳过渲染 */
  contain-intrinsic-size: 100vh;
}
```

### 过渡层叠

```css
.view-panel.leaving {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.view-panel.entering {
  position: relative;
  z-index: 1;
}
```

### 命名空间隔离

每个视图的布局 CSS 加上 `#view-*` 前缀避免冲突：

```css
/* home */
#view-home .main-layout {
  display: grid;
  grid-template-columns: 240px minmax(460px, 760px) minmax(260px, 340px);
}

/* knowledge */
#view-knowledge .main-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
}

/* tools */
#view-tools .bento-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
}
```

### 背景层跟随

```css
[data-active-view="home"] .bg-atmosphere {
  --bg-glow: radial-gradient(ellipse at 30% 20%, rgba(255,159,67,0.25), transparent 60%);
}
[data-active-view="knowledge"] .bg-atmosphere {
  --bg-glow: radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.1), transparent 60%);
}
[data-active-view="tools"] .bg-atmosphere {
  --bg-glow: radial-gradient(ellipse at 50% 30%, rgba(10,189,227,0.15), rgba(238,90,111,0.1), transparent 60%);
}
```

---

## 懒初始化策略

### 初始化注册表

```js
const viewInitializers = {
  home: initHomeView,        // barcode 生成器 + OCR + 数据工具
  knowledge: initKnowledge,  // Wiki CRUD + 教程 + Markdown 渲染
  tools: initTools,          // AI Chat + 9 技能 + 会话管理
};
```

### 初始化时机

- **首屏**：页面加载后立即初始化当前默认视图（home）
- **其他视图**：首次 `switchTo()` 时懒初始化，初始化后标记 `initialized.add(name)`
- **已初始化视图**：再次切入时跳过初始化，只触发 `view:didEnter` 恢复暂停的状态

### 视图生命周期事件

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `view:willLeave` | 旧视图即将离场 | 暂停 SSE 轮询、保存滚动位置 |
| `view:didEnter` | 新视图完成入场 | 恢复轮询、ScrollTrigger.refresh() |
| `view:ready` | 所有视图懒加载完成 | 预加载完成标记 |

---

## 共享状态

```js
window.__appState = {
  weather: null,       // 天气数据缓存（避免每个视图重复 fetch）
  onlineCount: 0,      // SSE 在线人数
  user: null,          // miaosite-auth 用户状态
};
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `index.html` | 重写 | 合并为唯一入口，包含三个视图面板 + ViewManager |
| `knowledge.html` | 删除 | 内容迁移到 index.html 的 #view-knowledge |
| `tools.html` | 删除 | 内容迁移到 index.html 的 #view-tools |
| `styles/base.css` | 修改 | 添加视图面板、过渡动画相关 CSS |
| `lib/miaosite-auth.js` | 不变 | 只加载一次即可 |
| `server.js` | 可能修改 | 确保 `/knowledge` `/tools` 路由重定向到 `/`（可选）|

---

## 迁移风险 & 缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 三页 JS 变量名冲突 | 高 | 每个视图的初始化函数包裹在 IIFE 或块级作用域中 |
| 文件过大（>8000行） | 中 | 合理分段，CSS 留在 `<style>` 中但 JS 拆分为独立模块 |
| GSAP ScrollTrigger 布局不同步 | 中 | 每次 `view:didEnter` 调用 `ScrollTrigger.refresh()` |
| 旧书签/外链失效 | 低 | 单一 URL 策略已接受此 tradeoff |
| content-visibility 导致 SSR/SEO | 低 | 本站为工具站，无 SEO 需求 |

---

## 成功标准

- [ ] 三个视图在同一个 index.html 中正常渲染
- [ ] nav-pill 切换触发放大缩小过渡，无明显卡顿
- [ ] 浏览器后退/前进不影响使用（单 URL 策略已接受）
- [ ] `prefers-reduced-motion` 下动画被跳过
- [ ] 各页原有功能完全保留（条码生成/OCR、知识库 CRUD、AI 聊天）
- [ ] 页面初始加载时间不超过当前 index.html 加载时间 + 200ms
- [ ] 无 JS 错误，console 干净
