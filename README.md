# 喵码 (miaosite) 🐱

> 全栈快递物流工具箱 + AI 智能助手，蜜柑苏打暖色系设计

**域名**: [miaojiaozhu.com](https://miaojiaozhu.com)  
**部署**: 宝塔面板 + Node.js + PM2  
**AI 引擎**: Mimo v2.5 多模态 (SSE 流式)

---

## ✨ 功能一览

| 功能 | 说明 |
|------|------|
| 📦 **条码生成器** | 粘贴快递单号 → 自动生成 CODE128 条码，支持批量输入、一键复制 |
| 📸 **OCR 识别** | 上传快递面单截图 → AI 自动识别单号、收件人、地址 |
| 📋 **智能整理** | 粘贴乱码文本 → 一键纠错、去重排序、格式化 |
| 🤖 **AI 工具箱** | 9 大技能卡片环绕中央对话区，Mimo v2.5 流式响应 |
| 📚 **知识库 Wiki** | 六类快递物流百科，支持分类浏览、Markdown 渲染 |
| 🐍 **Python 教程** | 《Python-100-Days》内置阅读器，进度追踪 |
| 💬 **对话管理** | 消息气泡、历史回话、编辑重发、导出 Markdown |

### 🧰 AI 工具箱技能卡片

| 技能 | 说明 |
|------|------|
| ✍️ 写作助手 | 15年经验商务文案专家，邮件、公文、营销文案 |
| 🌐 中英互译 | 专业级双向翻译，保留语气和格式 |
| 📖 知识问答 | 通用知识 + 快递物流行业专长 |
| 📊 Excel 公式 | 公式生成、数据透视、图表建议 |
| 💡 头脑风暴 | 创意发散、方案对比、多角度分析 |
| 📅 工作周报 | 输入要点 → 输出结构化周报 |
| 📝 Markdown 排版 | 输入文本 → 精美 Markdown 格式输出 |
| 📄 长文总结 | 长文本精炼摘要，提取关键信息 |
| 💬 通用助手 | 日常对话、代码辅助、猫娘卖萌 |

---

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js / Express 4 / JWT + bcryptjs |
| 前端 | 原生 HTML + CSS + JS（无框架）/ JsBarcode / Tesseract.js |
| AI | Mimo v2.5 (SSE 流式对话 / OCR / 数据解析) |
| 部署 | 宝塔面板 / PM2 / Nginx 反代 / SSL |
| 存储 | JSON 文件 (data/ 目录) |

---

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 设置环境变量 (Windows)
set MIMO_API_KEY=your_key
set DEEPSEEK_API_KEY=your_key
set JWT_SECRET=your_secret

# 启动
node server.js
# 访问 http://localhost:3000
```

---

## 📁 项目结构

```
miaosite/
├── server.js              # Express 后端 (API + SSE)
├── index.html             # 首页 — 条码生成 + OCR
├── tools.html             # AI 工具箱 — 卡片环绕对话
├── knowledge.html         # 知识库 Wiki + Python 教程
├── 404.html               # 自定义 404
├── barcode_decoder.py     # Python 本地条码解码
├── ocr_shipping.py        # Python OCR 快递面单
├── ecosystem.config.js    # PM2 配置 (不提交)
├── lib/                   # 前端静态库
│   ├── gsap.min.js        #   GSAP 动画引擎
│   ├── ScrollTrigger.min.js
│   ├── jsbarcode.min.js   #   JsBarcode 条码生成
│   ├── marked.min.js      #   Markdown 渲染
│   ├── highlight.min.js   #   代码高亮
│   └── katex.min.js       #   数学公式渲染
├── data/                  # JSON 数据文件
│   ├── knowledge.json     #   知识库文章
│   ├── prompts.json       #   提示词模板
│   ├── python_tutorial.json  # Python 教程数据
│   └── python_tutorial_images/  # 教程图片
├── docs/superpowers/      # 设计文档
│   ├── specs/             #   设计规格
│   └── plans/             #   实现计划
└── logs/                  # 运行日志
```

---

## 🔒 安全

- 文件上传 MIME + 扩展名白名单
- Prompt Injection 防护：文件内容 `<user_file>` XML 标签隔离
- JWT 认证 + bcrypt 密码哈希
- Helmet 安全头 + API 限流
- 敏感文件 .gitignore 排除

---

## 📄 License

MIT
