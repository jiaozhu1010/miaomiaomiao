# Task 4: ViewManager 路由 + 共享 JS

> 日期: 2026-06-25 | 状态: 完成

## 改动概述

在 `index.html` 共享 `<script>` 块中实现 ViewManager 视图路由系统，包含 GSAP 驱动的 Apple 风格缩放过渡、导航绑定、键盘快捷键、共享在线人数 SSE 和天气/雨滴初始化。

## 改动文件

### `index.html` — 修改（+228 / -28 行）

#### 1. ViewManager 核心引擎

替换了原有的占位式视图路由系统（`window.__viewInitializers` + 简单 nav-pill 点击切换）为完整的 ViewManager IIFE：

- **`ViewManager.register(name, initFn)`**: 注册视图初始化函数，同时存储到 `views`、`initializers` 和 `window.__viewInitializers` 以便向下兼容
- **`ViewManager._markInitialized(name)`**: 手动标记视图已初始化
- **`ViewManager.switchTo(name)`**: 带过渡锁的视图切换，支持懒初始化
- **`ViewManager.isInitialized(name)`**: 查询视图初始化状态
- **`updateNavPill(name)`**: GSAP 驱动 nav-pill-indicator 和 nav-pill-lamp 滑动动画（`expo.out` 缓动，350ms）
- **`updateNavTitle(name)`**: 切换导航栏标题/副标题
- **`animateView(fromName, toName)`**: Apple 风格缩放位移过渡（旧视图 scale 0.92 + opacity 0，新视图 scale 0.95→1 + opacity 0→1，背景层同步过渡）
- **`prefers-reduced-motion` 处理**: 自动检测系统偏好并跳过动画
- **`getTransitionOrigin()`**: 基于当前 nav-pill-tab 的 `getBoundingClientRect()` 计算 transform-origin

#### 2. 导航绑定

- `DOMContentLoaded` 时绑定所有 `[data-view]` 按钮点击到 `ViewManager.switchTo()`
- 键盘快捷键: `1` → knowledge, `2` → home, `3` → tools（输入框中不触发）

#### 3. 共享在线人数 SSE

- 优先使用 `EventSource('/api/online-count-sse')` 实时通道
- 回退到 30 秒轮询 `GET /api/online-count`
- 更新 `#online-count` 显示

#### 4. 共享天气/雨滴初始化

- 检查 `WeatherState.getRainState()` 状态
- 若为下雨状态则启动 `RaindropOverlay` 遮罩
- 若状态未知则 fetch 苏州天气并判断

#### 5. initHomeView 注册方式修复

- 移除旧的 `window.__viewInitializers.home = initHomeView` + 条件初始化
- 改为通过 `ViewManager.register('home', initHomeView)` 注册
- 通过 `DOMContentLoaded` 事件判断 `ViewManager.isInitialized('home')` 后初始化

## 部署步骤

1. 将 `index.html` 上传到宝塔面板 `/www/wwwroot/miaosite/`
2. 刷新浏览器即可
3. 切换视图应看到 GSAP 缩放过渡动画
