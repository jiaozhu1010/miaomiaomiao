# Task 3: 旧 index.html 内容迁移到 SPA 首页面板

> 日期: 2026-06-25 | 状态: 完成

## 改动概述

将原独立 `index.html` 的完整内容迁移到 SPA 单一入口 `index.html` 的 `#view-home` 面板中，包括视图专用 CSS、DOM 结构和初始化 JavaScript，并通过 ViewManager 路由系统注册为可懒加载的视图。

## 改动文件

### `index.html` — 重写 (新增约 3200 行)

#### 1. 视图专用 CSS (`<head>` 内新增 `<style>` 块)

所有原 `index.html` 中的页面样式经过 `#view-home` 前缀隔离后嵌入。包含：
- **三栏布局**: `.main-layout` grid 系统（天气栏 + 条码主区 + OCR/工具侧栏）
- **毛玻璃卡片**: `.glass-card` 及其 hover 状态
- **输入系统**: `#barcode-input`、`.btn-prefix`、`.quick-tools`
- **统计卡片**: `.stats-row`、`.stat-card` 四维统计样式
- **工具栏**: `.btn` 按钮系统（accent/ghost/danger/info/comma）、`.pretty-select` 自定义选择器
- **条码输出区**: `.barcode-output`、`.barcode-item`、`.barcode-mini-btn`
- **历史记录**: `.history-card`、`.history-entry`
- **OCR 面板**: `.ocr-dropzone`、`.ocr-progress`、`.ocr-candidates`
- **AI 数据处理**: `.data-tools-tabs`、`.data-tools-input`、`.data-tools-table`
- **天气卡片**: `.weather-card` 及逐日/逐时预报
- **灯箱** (无前缀，共享元素): `.lightbox-overlay`
- **回到顶部** (无前缀，fixed 定位): `.back-to-top-wrap`
- **强制刷新按钮** (无前缀，共享 nav 元素): `.force-refresh-btn`
- **响应式断点**: 1100px / 768px / 480px 三档

#### 2. 首页 DOM (`#view-home` 内)

将原 `index.html` 的完整页面内容（不含已移至 SPA 外壳的共享元素）迁移：
- 沉浸式灯箱 (`.lightbox-overlay`)
- 三栏主体布局：天气卡片（`#weather-card`） + 条码主区 + OCR/数据工具侧栏
- 回到顶部按钮 (`#back-to-top-wrap`)
- 页脚 (`#site-footer`)

已从 #view-home 中排除的共享元素（已在 SPA 外壳中）：
- 导航栏 (`.nav-bar`)
- 背景氛围层 (`.bg-atmosphere` / `.bg-grid` / `.bg-grain` / `.bg-yellow-glow`)
- Toast 通知 (`#toast`)
- 认证根容器 (`#auth-root`)
- 共享 JS 库加载 (GSAP, ScrollTrigger, jsbarcode, miaosite-auth 等)

#### 3. `initHomeView()` 初始化函数

所有原 `index.html` 的初始化逻辑封装为 `window.initHomeView` 函数，已移除的共享代码：
- Cache-bust 脚本（已在 SPA 外壳 `<head>` 中）
- 库注入脚本（miaosite-auth、jsbarcode、GSAP 等——已在共享 script 标签中）
- 旧页面 DOM 引用中指向共享元素的保持不变（`#force-cache-refresh`、`#online-count`、`#admin-entry` 等仍在 SPA 外壳 nav 中）

主要功能模块：
- 条码生成（JsBarcode CODE128，支持批量/排列/高度）
- OCR 识别（pyzbar + Mimo v2.5 双引擎）
- 沉浸式灯箱（缩放/拖拽/双指手势）
- AI 智能数据处理（DeepSeek 文本解析 + Mimo 图片识别）
- 历史记录（localStorage + 服务端同步）
- 回到顶部（带火箭发射动画）
- GSAP 动画系统（背景光晕、入场动画、统计数字、卡片滚动揭示）
- 天气卡片（城市切换、逐日/逐时预报）
- GlassSurface 玻璃滤镜

#### 4. ViewManager 注册

在页面底部建立简单的视图路由系统：
- `window.__viewInitializers` 注册表供 Task 4 扩展
- Nav pill 点击处理：懒初始化 + 视图切换
- 首页在页面加载时立即初始化

### `styles/base.css` — 无改动

### `lib/jsbarcode.min.js` — 无改动

jsbarcode 已在共享脚本引用中加载（只加载一次）。

## 已删除

- `old-index.html`（临时恢复文件，任务完成后清理）

## 部署步骤

1. 将 `index.html` 上传到宝塔面板 `/www/wwwroot/miaosite/`
2. 刷新浏览器即可查看效果（未修改 server.js，无需重启 PM2）
3. 验证首页功能：条码生成、OCR 识别、天气显示、回到顶部均正常工作
