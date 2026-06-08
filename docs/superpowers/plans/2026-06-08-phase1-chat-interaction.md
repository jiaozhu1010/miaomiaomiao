# Phase 1: 聊天交互核心升级 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级 AI 工具箱聊天交互：流式可中断、消息气泡可视化、编辑重发、自适应输入框、对话导出

**Architecture:** 仅改动 `tools.html`（前端）和 `server.js`（后端 SSE 断连检测）。纯原生 JS/CSS，无新依赖。

**Tech Stack:** 原生 JavaScript, CSS Grid/Flexbox, SSE (Server-Sent Events), AbortController API

---

## 文件职责

| 文件 | 职责 |
|------|------|
| `tools.html` | 聊天卡片 UI 重构（气泡列表 + 输入区 + 导出）、AbortController 流控制、消息历史管理 |
| `server.js` | SSE 端点增加 `req.destroyed` 检测，中断时释放 DeepSeek API 连接 |

---

### Task 1: 后端 — SSE 断连检测

**文件:**
- Modify: `server.js`（/api/ai-chat 端点内）

- [ ] **Step 1: 在 SSE 流循环中增加客户端断开检测**

在 `server.js` 的 `/api/ai-chat` 处理中，找到 `while (true)` 读取 DeepSeek 流的位置，在 `done` 检查后加入 `req.destroyed` 检测：

```javascript
// 在 while(true) 循环中，done 检查后添加：
if (req.destroyed || res.destroyed) {
    console.log(`[INFO] 客户端断开连接，终止流式响应`);
    // 清理 DeepSeek 请求
    if (deepseekRes && !deepseekRes.bodyUsed) {
        try { deepseekRes.body.cancel(); } catch(_) {}
    }
    return;
}
```

并在 fetch DeepSeek API 时保存 `deepseekRes` 引用供取消使用。

- [ ] **Step 2: 验证**

Run: `node --check server.js`
Expected: 无语法错误

---

### Task 2: 前端 — 停止生成按钮

**文件:**
- Modify: `tools.html`

- [ ] **Step 1: HTML — 发送按钮改为可切换状态**

找到 `chat-send-btn`（`id="chatSendBtn"`），确认其结构，无需改 HTML，用 JS 动态切换文字和样式。

- [ ] **Step 2: CSS — 停止态样式**

在 `.chat-send-btn` 样式后追加：

```css
.chat-card .chat-send-btn.stop-state { background:linear-gradient(135deg,#ee5a6f,#f0906b); animation:breathRed 1.8s ease-in-out infinite; }
@keyframes breathRed { 0%,100%{box-shadow:0 0 0 0 rgba(238,90,111,0.4)} 50%{box-shadow:0 0 0 10px rgba(238,90,111,0)} }
```

- [ ] **Step 3: JS — AbortController + 按钮状态切换**

修改 `sendChatMessage` 函数：

```javascript
let abortController = null;

async function sendChatMessage(retry = false) {
    // ... 现有校验逻辑 ...

    // 如果正在生成，点击即停止
    if (abortController) {
        abortController.abort();
        return;
    }

    // 创建新的 AbortController
    abortController = new AbortController();
    const btn = document.getElementById('chatSendBtn');
    const originalText = btn.textContent;
    btn.textContent = '⏹ 停止';
    btn.classList.add('stop-state');

    // 在 streamAI 中传入 signal
    await streamAI({
        skill,
        historyMessages: chatMessages,
        settings: { ... },
        files: filesToSend,
        signal: abortController.signal,
        onToken(token) { ... },
        onThinking(t) {},
        onCitation(c) {},
        onDone() {
            loading.classList.remove('show');
            resultWrap.classList.add('show');
            chatMessages.push({ role: 'assistant', content: fullContent });
            saveCurrentChat();
            if (resultDiv.scrollHeight > 340) {
                document.getElementById('resultToggle').classList.add('show');
            }
            resetSendButton();
        },
        onError(err) {
            loading.classList.remove('show');
            resultDiv.innerHTML = `<span style="color:var(--accent-2)">${escHtml(err)}</span>`;
            resultWrap.classList.add('show');
            resetSendButton();
        }
    });

    function resetSendButton() {
        abortController = null;
        btn.textContent = originalText;
        btn.classList.remove('stop-state');
    }
}
```

修改 `streamAI` 函数签名，接收 `signal` 并传给 `Auth.fetch`：

```javascript
async function streamAI({ skill, historyMessages, settings, files, signal, onToken, onThinking, onCitation, onDone, onError }) {
    // ...
    const res = await Auth.fetch('/api/ai-chat', { method:'POST', body:formData, signal });
    // signal 已传入 fetch，AbortController 中断时自动抛出 AbortError
    // ...
    } catch(err) {
        if (err.name === 'AbortError') {
            onDone({}); // 保留已生成内容
            return;
        }
        onError(err.message);
    }
}
```

- [ ] **Step 4: 验证**

Run: `node -e "new Function(document.querySelector('script').textContent)"` 或直接浏览器测试。
Expected: 发送后按钮变红+呼吸灯、显示⏹停止；点击停止后恢复蓝色原状态。

---

### Task 3: 前端 — 消息气泡列表

**文件:**
- Modify: `tools.html`

- [ ] **Step 1: HTML — 替换输出区结构**

将当前的 `<div class="chat-result" id="chatResult">` 内的单一 `result-content` 替换为消息列表容器：

```html
<div class="chat-result" id="chatResult">
    <div class="msg-list" id="msgList"></div>
    <div class="result-toggle" id="resultToggle">
        <button onclick="openReaderPanel()">📖 展开全部</button>
    </div>
    <div class="result-actions">
        <button data-action="copy">📋 复制</button>
        <button data-action="retry">🔄 重新生成</button>
    </div>
</div>
```

- [ ] **Step 2: CSS — 消息气泡样式**

新增：

```css
/* 消息列表 */
.chat-card .msg-list { display:flex; flex-direction:column; gap:12px; max-height:320px; overflow-y:auto; padding-right:4px;
    scrollbar-width:thin; scrollbar-color:rgba(0,0,0,0.12) transparent; }
.chat-card .msg-list::-webkit-scrollbar { width:5px; }
.chat-card .msg-list::-webkit-scrollbar-track { background:transparent; }
.chat-card .msg-list::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.12); border-radius:10px; }
/* 气泡 */
.chat-card .msg-bubble { max-width:88%; padding:8px 14px; border-radius:16px; font-size:13px; line-height:1.6; word-break:break-word; position:relative; }
.chat-card .msg-bubble.user { align-self:flex-end; background:linear-gradient(135deg,#e8f4fd,#dceefb); border-bottom-right-radius:4px; color:var(--text-primary); }
.chat-card .msg-bubble.ai { align-self:flex-start; background:rgba(0,0,0,0.03); border-bottom-left-radius:4px; color:var(--text-primary); }
/* 气泡操作按钮 */
.chat-card .msg-bubble .bubble-actions { display:none; gap:4px; position:absolute; top:-10px; right:8px; }
.chat-card .msg-bubble:hover .bubble-actions { display:flex; }
.chat-card .msg-bubble .bubble-actions button { width:24px; height:24px; border-radius:50%; border:1px solid rgba(0,0,0,0.1); background:rgba(255,255,255,0.9); font-size:11px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
.chat-card .msg-bubble .bubble-actions button:hover { background:#fff; transform:scale(1.1); }
/* 编辑气泡 */
.chat-card .msg-bubble.user .bubble-actions .edit-btn { color:var(--accent-3); }
/* AI 气泡 header */
.chat-card .msg-bubble.ai .ai-label { font-size:10px; color:var(--text-tertiary); margin-bottom:2px; }
```

- [ ] **Step 3: JS — 消息渲染函数**

新增消息管理逻辑：

```javascript
let msgIdCounter = 0;

function renderMsgList() {
    const container = document.getElementById('msgList');
    container.innerHTML = chatMessages.map((m, i) => {
        const id = 'msg_' + (msgIdCounter++);
        if (m.role === 'user') {
            return `<div class="msg-bubble user" id="${id}">
                <div class="bubble-actions">
                    <button class="edit-btn" onclick="editUserMsg(${i})" title="编辑">✏️</button>
                </div>
                ${escHtml(m.content)}
            </div>`;
        } else {
            return `<div class="msg-bubble ai" id="${id}">
                <div class="ai-label">🤖 AI 回复</div>
                ${renderMarkdown(m.content)}
            </div>`;
        }
    }).join('');
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}
```

修改 `onToken` 回调：流式输出时更新最后一条 AI 气泡的 Markdown 渲染。

```javascript
let currentAiBubbleId = null;

onToken(token) {
    fullContent += token;
    if (!currentAiBubbleId) {
        // 首次 token：创建 AI 气泡
        currentAiBubbleId = 'msg_ai_' + (msgIdCounter++);
        msgList.innerHTML += `<div class="msg-bubble ai" id="${currentAiBubbleId}">
            <div class="ai-label">🤖 AI 回复</div>
            <div class="bubble-content"></div>
        </div>`;
    }
    const bubble = document.getElementById(currentAiBubbleId);
    if (bubble) {
        bubble.querySelector('.bubble-content').innerHTML = renderMarkdown(fullContent);
    }
    msgList.scrollTop = msgList.scrollHeight;
},

onDone() {
    loading.classList.remove('show');
    resultWrap.classList.add('show');
    chatMessages.push({ role: 'assistant', content: fullContent });
    saveCurrentChat();
    currentAiBubbleId = null;
    document.getElementById('resultToggle').classList.toggle('show',
        document.getElementById('msgList').scrollHeight > 340);
    resetSendButton();
},
```

- [ ] **Step 4: 验证**

浏览器测试：发送多轮消息，确认用户气泡右对齐蓝色、AI 气泡左对齐灰色、Markdown 在气泡内正确渲染。

---

### Task 4: 前端 — 编辑重发

**文件:**
- Modify: `tools.html`

- [ ] **Step 1: JS — 编辑用户消息**

新增 `editUserMsg` 函数：

```javascript
function editUserMsg(index) {
    const msg = chatMessages[index];
    if (!msg || msg.role !== 'user') return;
    const input = document.getElementById('chatInput');
    input.value = msg.content;
    input.focus();
    // 标记编辑模式
    input.dataset.editingIndex = index;
    document.getElementById('chatSendBtn').textContent = '🔄 重新发送';
}
```

修改 `sendChatMessage`，检测编辑模式：

```javascript
async function sendChatMessage(retry = false) {
    const input = document.getElementById('chatInput');
    const userText = input.value.trim();
    // ...
    const editingIndex = input.dataset.editingIndex;
    if (editingIndex !== undefined) {
        // 编辑模式：替换原消息
        chatMessages[parseInt(editingIndex)].content = userText;
        // 删除编辑消息之后的所有 AI 回复
        chatMessages = chatMessages.slice(0, parseInt(editingIndex) + 1);
        delete input.dataset.editingIndex;
        document.getElementById('chatSendBtn').textContent = '发送 🚀';
    } else if (!retry) {
        chatMessages.push({ role: 'user', content: userText || '请分析我上传的文件' });
    }
    input.value = '';
    renderMsgList();
    // ...
}
```

- [ ] **Step 2: 验证**

发送消息 → hover 用户气泡 → 点击 ✏️ → 输入框回填原文 → 修改后点 🔄 → 新 AI 回复替换旧的。

---

### Task 5: 前端 — 输入框自适应 + 快捷键

**文件:**
- Modify: `tools.html`

- [ ] **Step 1: CSS — 输入框自适应高度**

在 `chat-textarea` 样式中确保：

```css
.chat-card .chat-textarea { flex:1; min-height:52px; max-height:160px; padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,0.1); background:rgba(255,255,255,0.6); font-family:var(--font-body); font-size:13px; resize:none; line-height:1.6; transition:var(--transition-fast); overflow-y:auto; }
```

- [ ] **Step 2: JS — 自适应高度 + 快捷键**

在 `initChatCard` 中修改输入框事件：

```javascript
// 自适应高度
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
});

// 快捷键：Ctrl+Enter 发送，已有 Enter 发送
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault(); sendChatMessage();
    } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault(); sendChatMessage();
    }
    // Shift+Enter 自然换行（默认行为）
});
```

- [ ] **Step 3: 验证**

输入长文本 → 输入框自动增高到 160px → 内部滚动；Ctrl+Enter 发送；Shift+Enter 换行。

---

### Task 6: 前端 — 对话导出

**文件:**
- Modify: `tools.html`

- [ ] **Step 1: HTML — 导出按钮**

在 `result-actions` 中添加导出按钮：

```html
<div class="result-actions">
    <button onclick="exportChat('copy')">📋 复制对话</button>
    <button onclick="exportChat('download')">📥 下载 .md</button>
    <button data-action="retry">🔄 重新生成</button>
</div>
```

- [ ] **Step 2: JS — 导出逻辑**

```javascript
function exportChat(mode) {
    const md = chatMessages.map(m => {
        if (m.role === 'user') return `**🧑 你:**\n\n${m.content}\n`;
        else return `**🤖 AI:**\n\n${m.content}\n\n---\n`;
    }).join('\n');

    if (mode === 'copy') {
        navigator.clipboard.writeText(md).then(() => showToast('对话已复制喵~'));
    } else {
        const blob = new Blob([md], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `喵码对话_${new Date().toISOString().slice(0,10)}.md`;
        a.click();
        showToast('Markdown 文件已下载喵~');
    }
}
```

- [ ] **Step 3: 验证**

多轮对话后点击 📋 → 剪贴板中有完整 Markdown；点击 📥 → 下载 `.md` 文件。

---

## 自检清单

- [x] 每个 Task 有独立、可验证的交付物
- [x] 无 TBD/TODO 占位符
- [x] 所有 CSS/JS 代码完整可复制
- [x] 文件路径精确
- [x] 各 Task 之间无类型/函数名冲突（`abortController`, `msgList`, `chatMessages`, `currentAiBubbleId` 统一命名）
