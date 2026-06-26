# Task 5: 知识库视图迁移到 SPA (#view-knowledge)

> 日期: 2026-06-25 | 状态: 完成

## 改动概述

将 `knowledge.html`（4634 行）的全部知识库功能迁移到 `index.html` 的 `#view-knowledge` SPA 面板中。包括：Wiki CRUD（文章列表/详情/编辑器）、Markdown 渲染（marked + KaTeX 数学公式）、EPUB 阅读器（epub.js）、Python 教程模式（侧边栏/内容/搜索）、图片灯箱、GSAP 入场动画。

## 改动文件

### `index.html` — 修改（+2532 / -8 行）

#### 1. `#view-knowledge` 作用域 CSS

添加了完整的知识库专用样式，所有选择器以 `#view-knowledge` 前缀隔离，不与首页（`#view-home`）样式冲突。包含：

- 字体变量覆盖、玻璃卡片、主布局（两栏）
- 侧边栏（搜索、分类、标签云）及其移动端抽屉样式
- 文章列表、详情、编辑器（含分类下拉、图片/书籍上传、Markdown 分栏编辑）
- Markdown 渲染（代码块、表格、图片、数学公式）
- 分页、空状态、加载指示器
- 模式切换标签栏（文章/教程）及 GSAP 滑动指示器
- 教程模式（目录树、内容区、进度点、代码复制按钮）
- 响应式断点（1100px / 768px / 600px / 480px）

#### 2. 全局阅读器面板 CSS

为共享的 `#reader-panel` 添加完整样式（工具栏、正文区域、主题切换、字体大小控制），替换原本无样式的占位 HTML 结构。

#### 3. 知识库 DOM 结构

在 `#view-knowledge` 中插入：

- 图片灯箱（`#vk-lightbox-overlay/#vk-lightbox-img`，独立 ID 避免与首页灯箱冲突）
- 移动端侧边栏切换按钮 + 遮罩层
- 模式切换标签栏（文章/教程）
- 主布局（侧边栏 + 内容区）
  - 侧边栏：搜索、分类筛选、标签云
  - 内容区（文章模式）：操作栏、文章列表、分页、文章详情、编辑器
  - 内容区（教程模式）：欢迎页、教程内容区
- 右下角悬浮按钮（返回列表 + 回到顶部）

#### 4. `initKnowledge()` 初始化函数

约 5300 行的大函数，包含知识库全部交互逻辑。相对于 `knowledge.html` 的原版 JS，移除了：

- 在线人数 SSE + 心跳 + 轮询（已由 SPA 共享层提供）
- 天气状态/雨滴效果初始化（已由 SPA 共享层提供）
- 导航栏药片指示器动画（已由 ViewManager 接管）
- Auth 模块动态注入（已在共享脚本中加载）
- Service Worker 注册
- Toast 函数重复定义（使用共享 toast 元素）

保留并适配了：

- 主题初始化、登录 Toast
- 状态管理、Markdown 渲染（marked + KaTeX + DOMPurify）
- 已读文章追踪（localStorage）
- Wiki CRUD（列表/详情/编辑器/搜索/分类/标签/分页/置顶/删除/图片上传/书籍上传）
- 内置阅读器（PDF/EPUB/TXT/MD），改用全局 `#reader-panel`
- 图片灯箱，改用独立的 `#vk-lightbox-overlay`
- Python 教程模式（同步/目录/内容/搜索/进度追踪/GSAP 动画）
- GSAP 入场动画（模式标签栏、侧边栏、文章卡片、滚动揭示）

所有 `onclick` 处理函数导出到 `window` 对象，确保模板生成的 HTML 能够正常调用。

#### 5. 共享前端库

在共享脚本区添加静态引用：

- `marked.min.js` — Markdown 渲染
- `highlight.min.js` — 代码高亮
- `katex.min.js` — 数学公式

DOMPurify 和 epub.js 保持动态 CDN 加载（`initKnowledge` 外部的 IIFE）。

#### 6. 阅读器面板结构升级

将原本只有 `style="display:none"` 的 `#reader-panel` 升级为完整结构，包含：

- 左侧：关闭按钮 + 标题
- 右侧：主题切换（🌓）、字号减小（A-）、字号增大（A+）
- 正文区域和加载提示

### `knowledge.html` — 未修改

原页面保留，未做删除。未来可做为备选或直接删除。

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 灯箱 ID | `#vk-lightbox-*` | 避免与 `#view-home` 的 `#lightbox-overlay` ID 冲突 |
| 阅读器 | 全局 `#reader-panel` | 共享覆盖层，所有视图共用 |
| onclick 函数 | 导出到 `window` | 模板渲染的 HTML 需要全局可访问的函数 |
| 脚本加载 | 静态 + 动态混合 | marked/highlight/katex 静态加载，DOMPurify/epubjs 动态 CDN 减少初始体积 |
| CSS 作用域 | `#view-knowledge` 前缀 | 所有选择器加前缀，与首页样式完全隔离 |

## 部署步骤

1. 上传 `index.html` 到 `/www/wwwroot/miaosite/`
2. 因为只改了前端文件，刷新浏览器即可
