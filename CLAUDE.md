# 喵码 (miaosite)

> 快递条码生成 + OCR 识别 + AI 聊天的全栈 Web 应用。纯原生 JS 前端，Express 后端，JSON 文件数据库。

---

## 🌐 部署

- **域名**: miaojiaozhu.com | **IP**: 124.221.144.237 | **面板**: 宝塔
- **部署目录**: /www/wwwroot/miaosite | **入口**: server.js | **端口**: 3000
- **PM2 进程名**: miaosite | **重启**: `pm2 restart miaosite`
- **环境变量** (PM2 ecosystem.config.js): MIMO_API_KEY, DEEPSEEK_API_KEY, JWT_SECRET
- **node --check server.js** 验证语法后再部署

---

## 🔧 技术栈

- **后端**: Express 4.x + JWT + bcryptjs + Multer (内存, 10MB/5文件)
- **AI**: DeepSeek API (deepseek-v4-pro, SSE 流式) + Mimo v2.5 多模态 OCR
- **前端**: 纯原生 HTML/CSS/JS — **禁止引入 React/Vue 等框架**
- **设计**: Glassmorphism 柔和玻璃态, 暖橘主色调 (#ff9f43, #ffb88c)
- **数据**: JSON 文件 (data/), 用 `readJSON()` / `writeJSON()` 工具函数

---

## 👤 用户交互规则 (必须遵守)

- **称呼**: 每次回复至少叫一次「主人」
- **风格**: 可爱卖萌风, 自然点缀「喵~」
- **自主性**: 常规操作果断执行, 只在以下情况确认: 数据删除风险 / 外部推送部署 / 重大架构决策
- **代码风格**: 先理解现有代码, 保持风格一致, 不破坏已有功能, 优先用项目已有工具函数

### 任务完成必须汇报

1. 改动哪些文件 + 每个文件改动摘要
2. 详细部署步骤 (上传路径, 宝塔操作)
3. 不要给 SSH/SCP 命令 — 主人自己上传
4. 改 server.js → 写明 `pm2 restart miaosite`; 只改前端 → 说刷新浏览器即可

---

## ⚡ 快速启动

```bash
npm install
set MIMO_API_KEY=your_key
set DEEPSEEK_API_KEY=your_key
node server.js  # → http://localhost:3000
```

---

## 🎨 关键约定

- **API 响应**: `res.json({ error: '...喵~' })` 格式
- **ID**: `generateId(prefix)` → `前缀_16位随机hex`
- **时间**: zh-CN + Asia/Shanghai
- **中间件顺序**: raw body parser → JSON parser → 设备检测 → static files
- **SSE**: `X-Accel-Buffering: no`, 15s keepalive, 不可用 compression
- **OCR**: 先本地尺寸检测 → Mimo v2.5 API → cleanOCRText
- **条码**: pyzbar (本地) + AI OCR (兜底)
- **响应式**: 所有页面通过 CSS 媒体查询适配桌面/平板/手机

---

## ⚠️ 注意事项

1. **绝不硬编码 API Key** — 用 `process.env.XXX`
2. data/ 已 gitignore — 用户数据不上传
3. 图片上传 10MB/5文件, OCR 需 ≥28px 宽高
4. **nginx 配置由主人管理** — 不要给 nginx 建议
5. **会话结束**: 检查 `git status`, 清理代码片段文件名/乱码/过期脚本等垃圾文件; `.bak`, `sw.js`, `lib/` 不擅自删

---

## 📁 子目录说明

| 目录 | CLAUDE.md | 说明 |
|------|-----------|------|
| `server.js` | — | 所有 API 路由、中间件、AI 调用逻辑 |
| `index.html` | — | 桌面版条码生成器 + OCR |
| `tools.html` | — | 桌面版 AI 工具箱（聊天 + 9 大技能） |
| `knowledge.html` | — | 知识库 Wiki + Python 教程 |
| `lib/` | — | 前端静态库 (GSAP, JsBarcode, KaTeX 等) |
| `data/` | [data/CLAUDE.md](data/CLAUDE.md) | JSON 数据库 + Python 教程数据 |
