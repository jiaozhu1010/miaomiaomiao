# data/ — JSON 文件数据库

## 文件清单

| 文件 | 用途 | 读写函数 |
|------|------|----------|
| `users.json` | 用户账号 (bcrypt 密码哈希, JWT) | `readJSON()` / `writeJSON()` |
| `prompts.json` | AI 系统提示词模板 | 同上 |
| `conversations.json` | AI 对话历史 | 同上 |
| `barcode_history.json` | 条码生成记录 | 同上 |
| `knowledge.json` | 知识库文章 (含标题、分类、标签、内容) | 同上 |
| `chat.json` | 聊天模式配置 | 同上 |

## 约定

- 所有文件均被 `.gitignore` 排除 — **永远不上传 git**
- ID 格式: `kb_随机16位hex` (知识库) / `usr_随机16位hex` (用户) / `conv_随机hex` (对话) 等
- `createdAt` / `updatedAt` 时间用 `zh-CN` + `Asia/Shanghai`
- 知识库文章 `content` 字段可包含 Markdown, 上限 2000000 字符
- `readJSON(path)` 不存在时自动创建空数组 `[]`; `writeJSON(path, data)` 原子写入
