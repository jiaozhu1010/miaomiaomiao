# 喵码翻牌卡片居中 + 登录注册切换翻牌 — 设计文档

**日期**: 2026-06-23 | **状态**: 已确认 | **关联**: [2026-06-22-auth-flip-card-design.md](2026-06-22-auth-flip-card-design.md)

---

## 1. 背景

当前 React AuthModal 有两个体验问题：

1. **弹窗没有完美居中** — `#auth-root` 在 body 的 flex 容器内，可能受页面布局影响导致 fixed 定位偏移
2. **登录↔注册切换无动画** — mode state 变化时瞬间替换内容，缺少翻牌过渡

## 2. 方案

### 2.1 Portal 居中

AuthModal 改用 `createPortal` 渲染到 `document.body`，彻底隔离页面布局影响。

**改动**：[AuthModal.tsx](client/src/components/auth/AuthModal.tsx)
- `import { createPortal } from 'react-dom'`
- `return createPortal(<AnimatePresence>...</AnimatePresence>, document.body)`

### 2.2 登录↔注册嵌套翻牌

在 FlipCard 背面嵌套一个 FormFlipCard，LoginForm ↔ RegisterForm 切换时触发内层 rotateY 翻牌。

**新增**：[FormFlipCard.tsx](client/src/components/auth/FormFlipCard.tsx)
**修改**：[AuthModal.tsx](client/src/components/auth/AuthModal.tsx)

```
外层 FlipCard (WelcomeFace ↔ 表单区)
├── 正面: WelcomeFace
└── 背面: FormFlipCard [新组件]
    ├── 正面: LoginForm
    └── 背面: RegisterForm
```

状态机：
```
WelcomeFace —(外层翻转)→ LoginForm —(内层翻转)→ RegisterForm
                           ←(内层翻转)←
```

- 外层 `isFlipped` — WelcomeFace ↔ 表单区
- 内层 `isBackFlipped` — LoginForm ↔ RegisterForm
- FormFlipCard 复用 3D 翻牌结构（perspective + rotateY + backfaceVisibility）
- LoginForm/RegisterForm 的 switch 按钮触发内层翻转而非 mode 替换

### 2.3 不影响

- WelcomeFace、LoginForm、RegisterForm、SuccessFace 内部逻辑不变
- 后端 API 零改动
- 现有 CSS/Tailwind 配置不变
- FlipCard 组件不变

## 3. 成功标准

- [ ] AuthModal 通过 Portal 渲染到 body，弹窗在任意页面/视口尺寸居中
- [ ] 登录↔注册切换有流畅的 3D 翻牌动画
- [ ] 外层翻牌（WelcomeFace→表单）不受影响
- [ ] 登录/注册成功流程不受影响
- [ ] TypeScript 编译零错误
