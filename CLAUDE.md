# 喵码 (miaosite) — 项目总览

> 这是一个集快递单号条码生成、OCR 文字识别、AI 智能聊天于一体的全栈 Web 应用喵~

---

## 🌐 部署信息

| 项目 | 详情 |
|------|------|
| **域名** | miaojiaozhu.com |
| **服务器 IP** | 124.221.144.237 |
| **面板** | 宝塔 (Baota) |
| **部署目录** | /www/wwwroot/miaosite |
| **运行时** | Node.js + PM2 |
| **入口文件** | server.js |
| **端口** | 3000 |
| **PM2 进程名** | miaosite |
| **日志目录** | /www/wwwroot/miaosite/logs/ |

---

## 🧱 项目结构与文件地图

```
miaosite/
├── server.js              # 🔥 核心后端 — Express 服务器 (1355行)
├── index.html             # 🏠 桌面版首页 — 条码生成器「喵码」
├── chat.html              # 💬 桌面版 AI 聊天 —「和小橘聊天喵~」
├── 404.html               # 🚫 自定义 404 页面
├── barcode_decoder.py     # 🐍 Python 条码解码 (pyzbar + opencv)
├── ocr_shipping.py        # 🐍 Python OCR 快递面单识别
├── ecosystem.config.js    # ⚙️ PM2 配置文件
├── package.json           # 📦 Node 依赖清单
├── package-lock.json
├── chat.json              # 💾 聊天模式配置数据
├── .gitignore
├── .htaccess
├── .user.ini
│
├── data/                  # 💾 JSON 文件数据库
│   ├── users.json         #    用户数据
│   ├── prompts.json       #    系统提示词模板
│   ├── barcode_history.json # 条码历史记录
│   └── conversations.json # 对话历史
│
├── logs/                  # 📋 日志文件
├── node_modules/          # 📦 依赖
├── __pycache__/           # 🐍 Python 缓存
│
├── docs/superpowers/      # 📝 项目文档
│   ├── plans/             #    实现计划
│   └── specs/             #    设计规格
│
├── .claude/               # 🤖 Claude/Codex 配置
│   ├── settings.local.json
│   └── skills/            #    GSAP 动画技能
│
├── .agents/               # 🤖 Agent 技能库
│   └── skills/            #    GSAP 全套技能
│
└── .superpowers/          # ⚡ Superpowers 工作区
    └── brainstorm/        #    头脑风暴记录
```

---

## 🔧 技术栈

### 后端 (server.js)
- **框架:** Express.js 4.x
- **认证:** JWT (jsonwebtoken) + bcryptjs
- **文件上传:** Multer (内存存储, 最大 10MB/5文件)
- **数据存储:** JSON 文件读写 (data/ 目录)
- **外部 API 调用:**
  - 硅基流动 (SiliconFlow) — DeepSeek-OCR 图片识别
  - DeepSeek API — AI 聊天 (deepseek-v4-pro, SSE 流式)
- **本地条码解码:** Python pyzbar (通过 child_process.execFile 调用)
- **安全:** cookie-parser, trust proxy

### 前端
- **桌面版 (index.html):** 原生 HTML/CSS/JS — 条码生成 (JsBarcode) + Tesseract.js OCR
- **桌面版 (chat.html):** 原生 HTML/CSS/JS — AI 聊天界面 (SSE 流式接收)
- **手机版 (m/):** 独立前端, 自适应移动端, CSS 变量主题系统
- **设计风格:** 柔和玻璃态 (Glassmorphism) + 蜜柑苏打暖色系

### 外部依赖
- JsBarcode (条码生成)
- Tesseract.js (前端 OCR 降级)
- GSAP (动画库, 已配置技能)

---

## 🚦 API 路由表

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/api/ocr` | ❌ | 图片 OCR 识别 (SiliconFlow) |
| `POST` | `/api/barcode` | ❌ | AI 条码解码 (SiliconFlow) |
| `POST` | `/api/barcode-decode` | ❌ | 本地 pyzbar 条码解码 |
| `POST` | `/api/auth/register` | ❌ | 用户注册 |
| `POST` | `/api/auth/login` | ❌ | 用户登录 |
| `GET` | `/api/auth/me` | ✅ | 获取当前用户信息 |
| `POST` | `/api/auth/set-role` | 🔑 Admin | 设置用户角色 |
| `GET` | `/api/prompts` | ✅ | 获取提示词模板列表 |
| `POST` | `/api/prompts` | ✅ | 创建提示词 |
| `PUT` | `/api/prompts/:id` | ✅ | 更新提示词 |
| `DELETE` | `/api/prompts/:id` | ✅ | 删除提示词 |
| `DELETE` | `/api/prompts/seed-cleanup` | ✅ | 清理种子数据 |
| `POST` | `/api/admin/reset-all-seeds` | 🔑 Admin | 重置所有种子 |
| `GET` | `/api/conversations` | ✅ | 获取对话列表 |
| `POST` | `/api/conversations` | ✅ | 创建对话 |
| `PUT` | `/api/conversations/:id` | ✅ | 更新对话 |
| `DELETE` | `/api/conversations/:id` | ✅ | 删除对话 |
| `DELETE` | `/api/conversations` | ✅ | 清空所有对话 |
| `GET` | `/api/chat` | 🔓 可选 | 获取聊天配置 |
| `POST` | `/api/chat` | 🔓 可选 | 保存聊天配置 |
| `POST` | `/api/ai-chat` | ✅ | 🔥 AI 对话 (SSE流式, 支持文件上传) |
| `GET` | `/api/online-count` | ❌ | 在线人数统计 |
| `GET` | `/api/barcode-history` | ✅ | 获取条码历史 |
| `POST` | `/api/barcode-history` | ✅ | 保存条码记录 |
| `DELETE` | `/api/barcode-history/:id` | ✅ | 删除单条记录 |
| `DELETE` | `/api/barcode-history` | ✅ | 清空条码历史 |

> ✅ = 需要 JWT Bearer Token　🔑 = 需要 Admin Token　🔓 = 可选认证

---

## 🎨 代码风格与约定

### 通用规则
1. **所有后端 API 响应**统一用 `res.json({ error: '...' })` 格式，错误消息带「喵~」后缀
2. **数据文件**都在 `data/` 目录下以 JSON 格式存储，用 `readJSON()` / `writeJSON()` 工具函数读写
3. **ID 生成**用 `generateId(prefix)` — 格式为 `前缀_16位随机hex`
4. **时间格式**统一使用 `zh-CN` locale + `Asia/Shanghai` 时区
5. **前端设计语言**：柔和玻璃态 (Glassmorphism) — 半透明背景、柔和阴影、圆角卡片
6. **CSS 变量体系**：定义在 `:root` 中，按功能分组（颜色、间距、圆角、阴影、字体）
7. **主色调**：暖橘 (#ff9f43, #ffb88c) — 与猫咪/蜜柑主题一致

### 前端
- **不用任何框架** — 纯原生 JS, 避免引入 React/Vue
- **CSS 不使用 `outline: none` 在 focus 元素上** — 但此项目已全局禁用 (保持现状)
- **动画**：GSAP 用于复杂动画, CSS transition 用于简单过渡

### 后端
- **中间件顺序很重要**：raw body parser (OCR/barcode) → JSON parser → 设备检测 → static files
- **SSE 流式响应**：设置 `X-Accel-Buffering: no` + 15s keepalive
- **OCR 流程**：先本地尺寸检测 → SiliconFlow API → cleanOCRText 清理结果
- **条码解码双路径**：pyzbar (本地快速) + AI OCR (云端兜底)
- **环境变量**通过 PM2 ecosystem.config.js 管理，敏感信息**不要写入代码**
- **API Keys**: SILICONFLOW_API_KEY, DEEPSEEK_API_KEY, JWT_SECRET

---

## 👤 用户交互习惯 (超级重要!)

> 以下习惯是主人明确要求的，每次交互都必须遵守喵~

### 称呼
- **每次回复必须称呼用户为「主人」**，至少出现一次

### 说话风格
- **可爱卖萌风**，时不时在句尾加「喵~」
- 不用每句都加，自然点缀即可
- 错误消息、提示信息也可以用可爱的语气

### 自主性
- **主动判断，果断行动** — 不要在常规操作上反复问 yes/no
- 只在以下情况才询问确认：**数据删除/丢失风险**、**外部推送/部署**、**重大架构决策**

### 任务完成后
- **每次改完代码必须汇报改动了哪些文件** + 每个文件的改动摘要
- **必须给出详细的部署步骤**（宝塔面板操作、上传哪些文件到哪个目录）
- **不需要 SSH/SCP 命令** — 主人自己在宝塔面板上传文件
- **改了后端文件 (server.js) → 必须在步骤中写明:**
  > 宝塔面板 → 终端 → `pm2 restart miaosite`
- **只改了前端文件 (HTML/CSS/JS) → 告诉主人刷新浏览器即可，不需要重启**

### 代码修改原则
- 改动前先理解现有代码结构和风格
- 保持与已有代码一致的风格（注释密度、命名、代码组织）
- 新增功能不要破坏现有功能
- 优先使用项目中已有的工具函数和模式

---

## 🚀 快速启动 (本地开发)

```bash
# 安装依赖
npm install

# 设置环境变量 (Windows)
set SILICONFLOW_API_KEY=your_key
set DEEPSEEK_API_KEY=your_key

# 启动服务
node server.js
# 访问 http://localhost:3000
```

---

## 🔄 典型工作流程

### 修改前端 (index.html / chat.html / m/*)
1. 本地编辑文件
2. 告诉主人：上传到 `/www/wwwroot/miaosite/` 对应路径, 刷新浏览器

### 修改后端 (server.js)
1. 本地编辑文件
2. 用 `node --check server.js` 验证语法
3. 告诉主人：上传到 `/www/wwwroot/miaosite/server.js`
4. 告诉主人：宝塔面板 → 终端 → `pm2 restart miaosite`

### 修改 Python 脚本
1. 本地编辑
2. 上传到服务器对应路径
3. 通常不需要重启（server.js 每次请求时 execFile 调用）
4. 如果改了 barcode_decoder.py 且改了函数签名，可能需要重启

### 新增 NPM 依赖
1. 本地 `npm install xxx`
2. 上传 `package.json` 和 `package-lock.json`
3. 告诉主人：宝塔终端 `cd /www/wwwroot/miaosite && npm install --production`

---

## ⚠️ 注意事项

1. **不要硬编码 API Key** — 始终用环境变量 `process.env.XXX`
2. **data/ 目录已 gitignore** — users.json 等用户数据不上传 git
3. **手机版和桌面版完全独立** — 改了一边，要确认另一边是否需要同步
4. **SSE 流式响应不能加 compression 中间件** — 会导致缓冲
4. **图片上传限制 10MB / 5文件** — 在 multer 配置中
5. **DeepSeek-OCR 要求图片 ≥28px 宽高** — performOCR 有尺寸校验
6. **JWT_SECRET 生产环境必须覆盖** — 代码中有默认值仅用于开发
8. **宝塔面板的 nginx 配置由主人管理** — 不要随便给 nginx 配置建议
