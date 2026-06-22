# 喵码登录注册翻牌卡片 — 设计文档

**日期**: 2026-06-22 | **状态**: 已确认

---

## 1. 背景与目标

将喵码现有的原生 JS Glassmorphism 模态框登录/注册，重写为 React + Tailwind + Framer Motion 的 3D 翻牌卡片组件。这是喵码前端渐进式迁移到 React 的第一步。

**目标**:
- 登录/注册 UI 用 React 重写，视觉效果参考 Flip Card 翻牌动画
- 后端 Express API 保持不变，零改动
- React 组件挂载到现有 HTML 页面的指定 DOM 节点
- 保留喵码蜜柑苏打暖色系品牌基因（暖橘 #ff9f43）

---

## 2. 技术选型

| 层 | 技术 | 原因 |
|----|------|------|
| 构建工具 | Vite 6 | 快速 HMR，React 标准工具链 |
| 框架 | React 19 + TypeScript | 组件化，类型安全 |
| 样式 | Tailwind CSS 4 + shadcn/ui | 开发效率，与参考代码风格一致 |
| 动画 | Framer Motion | 3D rotateY 翻转动画 |
| 图标 | Lucide React (shadcn/ui 默认) | 轻量，Tree-shakable |
| API 对接 | 复用现有 `/api/auth/*` | 后端零改动 |

---

## 3. 目录结构

```
client/                          # 新建 React 前端
├── src/
│   ├── components/
│   │   └── auth/
│   │       ├── FlipCard.tsx      # 翻牌容器：3D 透视 + rotateY 动画
│   │       ├── WelcomeFace.tsx   # 正面：Logo + 欢迎语 + 功能亮点 + 翻转按钮
│   │       ├── LoginForm.tsx     # 背面-登录表单
│   │       ├── RegisterForm.tsx  # 背面-注册表单
│   │       └── SuccessFace.tsx   # 成功页
│   ├── lib/
│   │   ├── auth-api.ts          # API 调用封装 (login/register/me)
│   │   └── auth-store.ts        # 前端认证状态管理 (token/user)
│   ├── hooks/
│   │   └── use-auth.ts          # 认证 hook
│   ├── App.tsx                   # 根组件
│   ├── main.tsx                  # 入口
│   └── index.css                 # Tailwind + 项目色调覆盖
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

构建产物输出到 `www/` 目录，由 nginx/Express 静态托管。

---

## 4. 组件设计

### 4.1 翻牌卡片状态机

```
         ┌──────────────┐
         │  正面 (front)  │  WelcomeFace — 欢迎语 + 功能亮点
         └──────┬───────┘
                │ isFlipped = true
                ▼
         ┌──────────────┐
         │  背面 (back)   │
         │ ┌───────────┐ │
         │ │ LoginForm  │ │  ←→ 「没有账号？去注册」/「已有账号？去登录」
         │ │ RegisterForm│ │
         │ └───────────┘ │
         └──────┬───────┘
                │ login/register 成功
                ▼
         ┌──────────────┐
         │  正面 (front)  │  SuccessFace — 登录成功
         │  (success模式) │
         └──────────────┘
```

### 4.2 FlipCard（核心容器）

```typescript
interface FlipCardProps {
  cardWidth?: number      // 默认 400
  cardHeight?: number     // 默认 520
  className?: string
}

// 内部状态
// isFlipped: boolean      — 控制 rotateY
// authMode: 'login' | 'register'
// isSuccess: boolean
```

- 用 `perspective-1000` + `transformStyle: preserve-3d` 建立 3D 上下文
- Framer Motion `animate={{ rotateY: isFlipped ? 180 : 0 }}` 驱动翻转
- 正面 `backface-visibility: hidden`，背面旋转 180deg 后可见

### 4.3 WelcomeFace（正面）

- 喵码 Logo / 可爱图标
- 标题：「欢迎使用喵码 🐱」
- 副标题：「快递条码生成 + OCR 识别 + AI 聊天」
- 功能亮点列表（图标+文字）：🚀 快速识别、🔒 安全登录、⭐ 智能对话
- 「登录 / 注册」按钮 → 触发翻转

### 4.4 LoginForm / RegisterForm（背面）

- **LoginForm**：用户名/邮箱 + 密码 + 提交按钮 + 错误提示
- **RegisterForm**：用户名 + 邮箱 + 密码 + 确认密码 + 提交按钮
- 两个表单之间通过底部文字链接切换（无翻转，同面切换）
- 加载状态：按钮显示 spinner + "登录中..."
- 错误处理：表单上方红色提示

### 4.5 SuccessFace（成功状态）

- 成功图标动画（checkmark 弹跳）
- 「欢迎回来，{username} 喵~」
- 「继续」按钮 → 关闭弹窗，刷新页面用户状态

---

## 5. 数据流

```
[FlipCard]
    │
    ├── authMode: 'login' | 'register'
    ├── isFlipped: boolean
    ├── isSuccess: boolean
    ├── error: string | null
    ├── loading: boolean
    │
    ├── LoginForm
    │     └── onSubmit({ username, password })
    │           └── POST /api/auth/login → { token, user }
    │
    └── RegisterForm
          └── onSubmit({ username, email, password })
                └── POST /api/auth/register → { token, user }

// 认证成功后:
// 1. localStorage 存储 token + user（与现有 miaosite-auth.js 兼容）
// 2. isSuccess = true, isFlipped = false（翻回正面显示成功）
// 3. 触发 window 自定义事件 'miaosite:auth-change'
```

**关键兼容点**：React 登录后写入的 localStorage key 与现有 `miaosite-auth.js` 完全一致：
- `miaosite_token` — JWT token
- `miaosite_user` — 用户对象 JSON

这样 React 登录后，现有页面的 `MiaositeAuth.isLoggedIn()` 依然能正确返回 true。

---

## 6. 视觉设计

### 色调

| 变量 | 值 | Tailwind |
|------|-----|----------|
| 主色 accent | `#ff9f43` | orange-400 |
| 主色深 | `#f57c00` | orange-600 |
| 背景 | 毛玻璃白 | `bg-white/85 backdrop-blur-xl` |
| 卡片边框 | 半透明白 | `border-white/40` |
| 文字主色 | 暖棕 | `text-stone-800` |
| 文字辅色 | 柔和棕 | `text-stone-500` |
| 错误 | 暖红 | `text-red-500` |

### 卡片外观

```
┌──────────────────────────┐
│  backdrop-blur-xl        │
│  bg-white/85             │
│  rounded-2xl             │
│  shadow-xl               │
│  border border-white/40  │
│                          │
│    🐱  Logo              │
│    欢迎使用喵码           │
│    快递条码 + OCR + AI   │
│                          │
│    🚀 快速识别            │
│    🔒 安全登录            │
│    ⭐ 智能对话            │
│                          │
│    [ 登录 / 注册 ]        │
│                          │
└──────────────────────────┘
```

### 响应式

- Desktop: 卡片 400×520px
- Tablet (<768px): 卡片占满宽度，max-width 400px
- Mobile (<480px): 全屏模式，圆角缩小

---

## 7. 挂载策略

现有每个 HTML 页面在 `</body>` 前添加：

```html
<div id="auth-root"></div>
<script type="module" src="/www/assets/index.js"></script>
```

React 入口检测 `#auth-root` 存在后渲染 `<App />`。页面上的「登录」按钮点击时，派发自定义事件 `miaosite:show-auth`，React 监听该事件弹出翻牌卡片。

---

## 8. API 对接（后端零改动）

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/auth/login` | POST | 登录 | ✅ 已有 |
| `/api/auth/register` | POST | 注册 | ✅ 已有 |
| `/api/auth/me` | GET | 获取当前用户 | ✅ 已有 |

---

## 9. 不在本次范围内

- ❌ 全站 React 重写（后续渐进式迁移）
- ❌ 修改后端 API
- ❌ 修改现有页面布局（仅替换登录弹窗）
- ❌ 个人中心页面（Account modal）— 后续迭代
- ❌ 暗色模式

---

## 10. 成功标准

- [ ] 翻牌卡片登录流程完整可用
- [ ] 翻牌卡片注册流程完整可用
- [ ] 登录成功后现有页面正确识别用户状态
- [ ] 3D 翻转动画流畅（60fps）
- [ ] 移动端响应式正常
- [ ] 与现有 `miaosite-auth.js` 的 localStorage 格式兼容
- [ ] TypeScript 编译零错误
