# 喵码 AI 工具箱 — 三阶段升级设计文档

> 日期：2026-06-08 | 状态：已确认

## 概述

对 tools.html（AI 工具箱页面）+ server.js（后端服务）进行分模块升级，覆盖交互体验、视觉美化、后端健壮性三个维度。

---

## Phase 1：聊天交互核心升级

### 1.1 停止生成

**触发：** 发送按钮在 AI 思考中变为红色 `⏹ 停止`
**实现：**
- 前端：`AbortController` 绑定到 fetch 请求，点击停止时 `controller.abort()`
- 后端：SSE 写入时检测 `req.destroyed`（客户端断开），提前终止流
- 已收到的 token 内容保留在输出区

### 1.2 消息气泡 + 对话历史可视化

**现状：** 只有单个输出区，看不到对话上下文
**改造：** 输出区改为消息列表，每条消息独立渲染
- 用户消息：右对齐，浅色背景气泡
- AI 消息：左对齐，毛玻璃气泡，支持 Markdown
- 每条 AI 气泡有独立操作按钮（复制/重试）
- 流式输出时最新 AI 气泡实时增长

### 1.3 编辑 & 重新发送

- 用户气泡 hover 时显示 ✏️ 编辑图标
- 点击后原文回填输入框，可修改后重新发送
- 重发时替换原消息（不产生新条目）

### 1.4 输入框增强

- `textarea` 自适应高度：`input` 事件中重置高度 → `scrollHeight` 设定新高度，1~6 行
- `Ctrl+Enter` 发送（已有 Enter 发送、Shift+Enter 换行）
- 输入 `/` 时弹出技能卡片快捷选择浮层（内联 dropdown）

### 1.5 对话导出

- 输出区底部新增 `📥 导出` 按钮
- 复制为 Markdown：遍历对话历史，生成完整 .md 文本到剪贴板
- 下载 .md：Blob + `<a download>` 触发下载

---

## Phase 2：视觉美化升级

### 2.1 暗色模式

**方案：** CSS 变量切换
- 新增 `[data-theme="dark"]` 选择器，覆盖 `:root` 中的所有颜色变量
- 导航栏新增 🌙/☀️ 切换按钮，点击切换 `document.documentElement.dataset.theme`
- `localStorage` 持久化用户偏好
- 首次访问检测 `prefers-color-scheme: dark` 自动跟随系统
- 涉及变量：`--text-primary/secondary/tertiary`, `--glass-bg/bg-hover/bg-strong`, `--glass-border`, `--glass-shadow/hover`

### 2.2 卡片微动效

- **选中脉冲：** 选中时 `::after` 伪元素从卡片中心扩散（`scale(0)→scale(2)` + `opacity(1→0)`），400ms
- **hover 上浮：** `translateY(-4px)` + 阴影加深（已有基础，增强幅度）
- **切换动画：** 两张卡片间的选中态切换用 GSAP（项目已有配置）或纯 CSS transition

### 2.3 加载骨架屏

替换当前三个波纹点：
- 显示 2-3 行不同宽度的矩形条（模拟 Markdown 标题+段落结构）
- CSS `@keyframes shimmer` 从左到右渐变扫光
- 内容到达后骨架消失，输出区淡入

### 2.4 发送按钮动效

- 默认态：蓝色渐变 + 🚀
- 点击发送时：缩小 0.9 → 弹回 1.05 → 稳定 1.0，emoji 变为 🚀
- 思考中（停止态）：红底 + ⏹ + 呼吸灯动画（`box-shadow` 脉冲）

### 2.5 Toast 通知优化

- 位置：`top: 20px; right: 24px` 替代底部居中
- 入场：`translateX(120%)` → `translateX(0)` 滑入
- 三种类型：success（绿）/ error（红）/ info（蓝）
- 多消息堆叠：每条向下偏移，自动 3s 消失

### 2.6 滚动条全局美化

- 全局应用细滚动条（已在 result-content 实现，扩展到 body 和所有可滚动区）

---

## Phase 3：后端强化

### 3.2 SSE 断连恢复

**前端：**
- `onError` 中判断错误类型，网络错误触发重连
- 重连策略：指数退避 1s → 2s → 4s，最多 3 次
- 重连时发送 `lastMessageId` 或 `tokenCount`，告知后端从断点续

**后端：**
- 接收可选 `resumeFrom` 参数（已发送的 token 数）
- 重新发起 DeepSeek API 调用时，跳过已输出的 token
- 注意：DeepSeek API 无原生续传，采用"重发完整请求 + 前端跳过已渲染部分"的折中方案

### 3.3 请求超时 + 错误重试

**后端 fetch 配置：**
- `AbortSignal.timeout(60000)` — 60s 超时
- 超时 → 返回错误 + 记录日志
- 网络错误（`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`）→ 自动重试 1 次
- 4xx/5xx HTTP 响应 → 不重试，透传错误给前端

### 3.4 日志系统优化

**方案：** 轻量结构化日志
- 格式：`[2026-06-08 14:30:22] [INFO] [ai-chat] 用户 xxx 请求 skill=writing`
- 级别：INFO / WARN / ERROR
- 按天切割：`logs/2026-06-08.log`
- 启动时清理 30 天前的 `.log` 文件
- 工具函数：`log(level, module, message)`，同时写文件和控制台

---

## 改动文件

| 文件 | Phase | 改动量 |
|------|-------|--------|
| `tools.html` | 1, 2 | 重写聊天卡片区 + 新增 CSS 变量 + 暗色模式 |
| `server.js` | 3 | 新增日志模块 + 超时重试 + 断连检测 |

---

## 验证方式

1. Phase 1：发送消息 → 点击停止 → 确认中断；发多条消息 → 确认气泡可见；编辑消息 → 重发
2. Phase 2：点击 🌙 → 全页变暗色；选中卡片 → 看到脉冲波纹；发送消息 → 骨架屏闪现
3. Phase 3：拔网线 → 1s 后看到重连；查看 `logs/` → 当日日志文件存在
