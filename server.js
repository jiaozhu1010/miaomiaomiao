const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// =========================
// Auth 依赖
// =========================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'miaosite-dev-secret-change-in-production';
const JWT_EXPIRES = '7d';
const BCRYPT_ROUNDS = 10;
const DATA_DIR = path.join(__dirname, 'data');

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'miaosite-dev-secret-change-in-production') {
    console.warn('生产环境未设置 JWT_SECRET，当前使用开发默认值，请在宝塔/PM2 环境变量中配置强随机密钥。');
}

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) { fs.mkdirSync(LOGS_DIR, { recursive: true }); }

// 日志系统：按天切割，保留30天
function getLogFile() {
    const d = new Date();
    return path.join(LOGS_DIR, `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.log`);
}
function log(level, module, message) {
    const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const line = `[${ts}] [${level}] [${module}] ${message}\n`;
    console.log(line.trim());
    try { fs.appendFileSync(getLogFile(), line, 'utf8'); } catch (_) {}
}
// 启动时清理30天前的日志
function cleanupLogs() {
    try {
        const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        fs.readdirSync(LOGS_DIR).forEach(f => {
            const fp = path.join(LOGS_DIR, f);
            if (f.endsWith('.log') && fs.statSync(fp).mtimeMs < cutoff) {
                fs.unlinkSync(fp);
                console.log(`[INFO] [logger] 清理旧日志: ${f}`);
            }
        });
    } catch (_) {}
}
cleanupLogs();

// 数据文件路径
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');
const BARCODE_HISTORY_FILE = path.join(DATA_DIR, 'barcode_history.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');

// Wiki 知识库分类
const WIKI_CATEGORIES = ['logistics', 'tech', 'literature', 'humanities', 'lifestyle', 'business'];
const WIKI_CATEGORY_NAMES = {
    logistics: '快递物流', tech: '技术编程', literature: '文学小说',
    humanities: '人文社科', lifestyle: '生活百科', business: '经济管理'
};

// 生成唯一 ID
function generateId(prefix) {
    return prefix + crypto.randomBytes(8).toString('hex');
}

app.set('trust proxy', 1);  // 信任 nginx 这一层代理（宝塔反代）

// =========================
// 安全中间件
// =========================

// HTTP 安全头（允许 SSE 流式传输）
app.use(helmet({
    contentSecurityPolicy: false,   // 允许内联脚本和 CDN 资源
    crossOriginEmbedderPolicy: false,
}));

// 通用 API 限流（保护 OCR/条码解码/聊天不被滥用）
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟窗口
    max: 120,            // 每个 IP 最多 120 次请求/分钟
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求太频繁了喵~ 请稍后再试' },
    skip: (req) => req.path.startsWith('/api/ai-chat') || req.path.startsWith('/api/online-count'),
});
app.use('/api', apiLimiter);

// AI 聊天专用限流（更宽松，因为是长连接 SSE）
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '聊天太频繁了喵~ 请稍后再试' },
});
app.use('/api/ai-chat', chatLimiter);

// 阻止直接访问敏感目录和文件
app.use((req, res, next) => {
    const url = req.path;
    // 允许访问知识库上传的图片
    if (url.startsWith('/data/uploads/')) return next();
    const blocked = [
        '/data/', '/logs/', '/node_modules/',
        '/.git/', '/.agents/', '/.codex/', '/.claude/', '/.superpowers/',
        '/__pycache__/',
        '/ecosystem.config.js', '/package.json', '/package-lock.json',
        '/server.js', '/barcode_decoder.py', '/ocr_shipping.py',
        '/.htaccess', '/.user.ini'
    ];
    for (const prefix of blocked) {
        if (url.startsWith(prefix) || url === prefix) {
            return res.status(404).send('Not Found');
        }
    }
    next();
});

// =========================
// 图片工具函数
// =========================

/** 从 buffer 读取常见图片格式的宽高，无需第三方依赖 */
function getImageDimensions(buffer) {
    try {
        // PNG: 前8字节签名 → IHDR chunk 的 width(16-19) height(20-23)
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }
        // JPEG: 扫描 SOF 标记 (0xFF 0xC0 或 0xFF 0xC2)
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer.length > 10) {
            let offset = 2;
            while (offset < buffer.length - 9) {
                if (buffer[offset] !== 0xFF) break;
                const marker = buffer[offset + 1];
                if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
                    return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
                }
                offset += 2 + buffer.readUInt16BE(offset + 2);
            }
        }
        // GIF: 逻辑屏幕描述符 width(6-7) height(8-9) 小端
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer.length > 10) {
            return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
        }
        // WebP: VP8 (lossy) 或 VP8L (lossless)
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50 && buffer.length > 30) {
            if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
                return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(29) & 0x3FFF };
            }
            if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4C) {
                const bits = buffer.readUInt32LE(21);
                return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
            }
        }
        // BMP
        if (buffer[0] === 0x42 && buffer[1] === 0x4D && buffer.length > 26) {
            return { width: buffer.readUInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
        }
    } catch (_) { /* 解析失败，忽略 */ }
    return null; // 未知格式
}

function detectImageMimeType(buffer, fallback = 'image/png') {
    if (!buffer || buffer.length < 4) return fallback;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'image/bmp';
    return /^image\/(png|jpeg|jpg|gif|webp|bmp)$/i.test(fallback) ? fallback.replace('image/jpg', 'image/jpeg') : 'image/png';
}

function extractTrackingCodes(text) {
    const digitMap = {
        O: '0', Q: '0', D: '0', U: '0',
        I: '1', L: '1', '|': '1',
        S: '5', B: '8', Z: '2', G: '6', A: '4', T: '7'
    };
    const compact = String(text || '').toUpperCase().replace(/[^A-Z0-9|]/g, '');
    const codes = [];
    const seen = new Set();

    function prefixAt(index) {
        const chunk = compact.slice(index, index + 3);
        if (chunk === 'DPK' || chunk === '0PK' || chunk === 'OPK') return 'DPK';
        if (chunk === 'DPL' || chunk === 'DPI' || chunk === 'DP1' || chunk === '0PL' || chunk === 'OPL') return 'DPL';
        return '';
    }

    for (let i = 0; i < compact.length - 2; i++) {
        const prefix = prefixAt(i);
        if (!prefix) continue;
        let digits = '';
        for (let j = i + 3; j < Math.min(i + 33, compact.length); j++) {
            if (j > i + 3 && prefixAt(j)) break;
            const ch = compact[j];
            if (/\d/.test(ch)) digits += ch;
            else if (digitMap[ch]) digits += digitMap[ch];
            if (digits.length === 12) {
                const code = prefix + digits;
                if (!seen.has(code)) {
                    seen.add(code);
                    codes.push(code);
                }
                break;
            }
        }
    }

    return codes;
}

function cleanOCRText(text) {
    const raw = String(text || '').trim();
    const refs = [...raw.matchAll(/<\|ref\|>([\s\S]*?)<\|\/ref\|>/g)]
        .map(match => match[1].trim())
        .filter(Boolean);
    if (refs.length > 0) {
        return refs.join('\n');
    }

    return raw
        .replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, '')
        .replace(/<\|\/?ref\|>/g, '')
        .replace(/<\|[^|]+\|>/g, '')
        .trim();
}

/** OCR 共享函数 — 调用硅基流动 DeepSeek-OCR，返回识别文字 */
async function performOCR(imageBuffer, mimeType = 'image/png') {
    if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('缺少图片数据');
    }

    // 尺寸校验：DeepSeek OCR 要求宽高都 ≥ 28px
    const dims = getImageDimensions(imageBuffer);
    if (dims) {
        if (dims.width < 28 || dims.height < 28) {
            throw new Error(`图片尺寸 ${dims.width}x${dims.height} 太小，OCR 要求宽高至少 28px`);
        }
    } else if (imageBuffer.length < 1024) {
        // 无法解析格式且文件极小 → 很可能不是有效图片
        throw new Error('图片文件无效或太小（小于 1KB），无法 OCR 识别');
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
        throw new Error('OCR 服务未配置（缺少 SILICONFLOW_API_KEY）');
    }

    const safeMimeType = detectImageMimeType(imageBuffer, mimeType);
    const base64 = imageBuffer.toString('base64');
    const imageUrl = `data:${safeMimeType};base64,${base64}`;

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-ai/DeepSeek-OCR',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
                        { type: 'text', text: '<image>\n<|grounding|>OCR this image. 请识别图片中的所有文字和条形码。如果是条形码（如 CODE128、ITF、EAN 等），请直接输出条形码数字内容。直接返回识别结果，不要添加任何解释。' }
                    ]
                }
            ],
            max_tokens: 1024,
            temperature: 0
        }),
        signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('硅基流动 API 错误:', response.status, errorText);
        throw new Error(`硅基流动 API 错误 ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return cleanOCRText(text);
}

// =========================
// OCR 图片识别 API（代理硅基流动 — DeepSeek-OCR 快速免费）
// 放在 express.json 之前，用 raw 接收二进制图片，避免 JSON body 大小限制
// =========================

const rawImageBody = express.raw({ limit: '10mb', type: ['application/octet-stream', 'image/*'] });

app.post('/api/ocr', rawImageBody, async (req, res) => {
    try {
        const text = await performOCR(req.body, req.headers['content-type']);
        res.json({ text });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            console.error('OCR 请求超时');
            return res.status(504).json({ error: '识别请求超时' });
        }
        // 客户端错误（图片太小/无效）→ 400；服务端错误 → 500
        const isClientError = /太小|无效|缺少/.test(error.message);
        console.error('OCR 请求失败:', error.message);
        res.status(isClientError ? 400 : 500).json({ error: error.message || '识别服务异常' });
    }
});

// =========================
// 条码图片识别 API（用硅基流动 DeepSeek-OCR 解码条码/单号）
// =========================

app.post('/api/barcode', rawImageBody, async (req, res) => {
    try {
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ error: '缺少图片数据' });
        }
        if (!process.env.SILICONFLOW_API_KEY) {
            return res.status(500).json({ error: '条码解码服务未配置（缺少 SILICONFLOW_API_KEY）' });
        }
        const base64 = req.body.toString('base64');
        const imageUrl = `data:${detectImageMimeType(req.body, req.headers['content-type'])};base64,${base64}`;

        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}` },
            body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-OCR',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
                        { type: 'text', text: '<image>\n<|grounding|>OCR this image. 请解码图片中的条形码或快递单号。只输出 DPK/DPL 开头加 12 位数字的单号；如果没有识别到，输出 EMPTY。' }
                    ]
                }],
                max_tokens: 100,
                temperature: 0
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('条码解码 [SiliconFlow] 错误:', response.status, errText);
            return res.status(502).json({ error: `条码解码服务失败 (SiliconFlow: HTTP ${response.status})` });
        }

        const data = await response.json();
        const text = cleanOCRText(data.choices?.[0]?.message?.content || '');
        const codes = /^EMPTY$/i.test(text) ? [] : extractTrackingCodes(text);
        console.log('条码解码 [SiliconFlow]:', codes.length ? codes.join(',') : '(empty)');
        res.json({ text, codes });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            return res.status(504).json({ error: '条码解码超时' });
        }
        console.error('条码解码失败:', error.message);
        res.status(500).json({ error: '条码解码服务异常: ' + error.message });
    }
});

// =========================
// 条码解码 API（服务端 Python pyzbar + opencv — 专业条码解码引擎）
// =========================

const { execFile } = require('child_process');
const BarcodeDecoderScript = path.join(__dirname, 'barcode_decoder.py');

app.post('/api/barcode-decode', rawImageBody, (req, res) => {
    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: '缺少图片数据' });
    }

    const tmpFile = path.join(__dirname, 'data', `barcode_tmp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`);
    const mimeType = detectImageMimeType(req.body, req.headers['content-type']);

    fs.writeFile(tmpFile, req.body, (writeErr) => {
        if (writeErr) {
            console.error('条码解码: 写入临时文件失败', writeErr.message);
            return res.status(500).json({ error: '写入临时文件失败' });
        }

        execFile('python3', [BarcodeDecoderScript, tmpFile], {
            timeout: 15000,
            maxBuffer: 1024 * 1024
        }, (execErr, stdout, stderr) => {
            // 清理临时文件
            fs.unlink(tmpFile, () => {});

            if (execErr) {
                console.error('条码解码: Python 脚本执行失败', execErr.message);
                if (stderr) console.error('stderr:', stderr);
                return res.status(500).json({ error: '条码解码服务异常: ' + (execErr.message || 'unknown') });
            }

            try {
                const result = JSON.parse(stdout);
                console.log('条码解码 [pyzbar]:', result.codes && result.codes.length ? result.codes.join(',') : '(empty)');
                res.json(result);
            } catch (parseErr) {
                console.error('条码解码: JSON 解析失败', parseErr.message, 'stdout:', stdout);
                res.status(500).json({ error: '条码解码结果解析失败', raw: stdout });
            }
        });
    });
});

// =========================
// 通用中间件
// =========================

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname, {
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        // HTML 文件：每次都要验证，确保更新及时可见
        if (ext === '.html' || ext === '.htm') {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
        // 图片/字体等静态资产：缓存 7 天
        else if (/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|pdf|epub)$/i.test(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
        // JS/CSS 文件：缓存 1 天
        else if (/\.(js|css|mjs)$/i.test(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        // 其他文件（JSON/txt 等）：缓存 1 小时
        else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));


// =========================
// 在线人数统计（基于请求指纹）
// =========================
const onlineUsers = new Map(); // key: 用户指纹, value: 最后活跃时间戳
const ONLINE_TIMEOUT = 60000;  // 60秒无请求视为离线

function getUserFingerprint(req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ua = req.headers['user-agent'] || '';
    return `${ip}||${ua}`;
}

function updateOnlineUser(req) {
    const fingerprint = getUserFingerprint(req);
    onlineUsers.set(fingerprint, Date.now());
}

function getOnlineCount() {
    const now = Date.now();
    // 清理超时用户
    for (const [key, lastActive] of onlineUsers.entries()) {
        if (now - lastActive > ONLINE_TIMEOUT) {
            onlineUsers.delete(key);
        }
    }
    return onlineUsers.size;
}


// =========================
// 工具函数
// =========================

function readJSON(file, defaultValue) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return defaultValue;
    }
}

// 简单的写锁：防止同一文件被并发写入导致损坏
const _writeLocks = new Map();
function writeJSON(file, data) {
    // 如果有锁在等待，先等 100ms 再重试（最多等 10 次）
    for (let retry = 0; _writeLocks.has(file) && retry < 10; retry++) {
        const waitUntil = Date.now() + 100;
        while (Date.now() < waitUntil) { /* spin-wait */ }
    }
    _writeLocks.set(file, true);
    try {
        // 先写临时文件，再原子重命名（避免写一半崩溃导致文件损坏）
        const tmpFile = file + '.tmp.' + Date.now();
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpFile, file);
    } catch (err) {
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.error(`[${now}] writeJSON 失败 (${file}):`, err.message);
        try {
            fs.appendFileSync(path.join(__dirname, 'logs', 'err.log'),
                `${now}: writeJSON 失败 (${file}) — ${err.message}\n`);
        } catch (_) {}
        throw err;  // 让调用方 try/catch 处理
    } finally {
        _writeLocks.delete(file);
    }
}

// =========================
// JWT 认证中间件
// =========================

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: '请先登录喵~' });
    }
    try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET);
        req.user = decoded; // { id, username, email }
        next();
    } catch {
        return res.status(401).json({ error: '登录已过期，请重新登录喵~' });
    }
}

// 可选认证：已登录则注入 req.user，未登录也继续
function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), JWT_SECRET);
            req.user = decoded;
        } catch {
            // token 失效忽略，当游客处理
        }
    }
    next();
}

function adminTokenMiddleware(req, res, next) {
    const configuredToken = process.env.ADMIN_RESET_TOKEN;
    if (!configuredToken) {
        return res.status(404).json({ error: '管理员接口未启用' });
    }

    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const requestToken = req.headers['x-admin-token'] || bearerToken;
    if (requestToken !== configuredToken) {
        return res.status(403).json({ error: '管理员令牌无效' });
    }

    next();
}


// =========================
// AI 智能数据解析 API
// =========================

app.post('/api/data-parse', async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: '请提供需要解析的文本喵~' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'AI 服务未配置' });
    }

    const systemPrompt = `你是一个智能数据解析器。用户会给你一段杂乱的文本（可能是聊天记录、复制粘贴的内容、邮件正文等），你需要从中提取结构化数据。

规则：
1. 识别文本中的字段（如姓名、电话、地址、单号、日期、金额等）
2. 将每一条记录整理为一行
3. 自动识别最合适的列名
4. 只返回一个 JSON 对象，格式为：{"headers":["列1","列2",...],"rows":[["值1","值2",...],...]}
5. 不要返回任何其他内容，只返回纯 JSON
6. 如果文本中不包含任何可结构化的数据，返回 {"headers":["内容"],"rows":[["原始文本的第一行"],...]}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-v4-pro',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                max_tokens: 4096,
                temperature: 0.1,  // 低温度，提高输出稳定性
                stream: false
            }),
            signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('Data-parse API 调用失败:', response.status, errText);
            return res.status(502).json({ error: 'AI 服务暂时不可用喵~' });
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';

        // 解析 AI 返回的 JSON
        let parsed;
        try {
            // 去除可能的 markdown 代码块标记
            const cleanContent = content
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/\s*```$/, '')
                .trim();
            parsed = JSON.parse(cleanContent);
        } catch (parseErr) {
            console.error('Data-parse JSON 解析失败:', parseErr.message, '原始内容:', content.slice(0, 200));
            return res.status(502).json({ error: 'AI 返回格式异常，请重试喵~' });
        }

        // 校验返回结构
        if (!parsed.headers || !Array.isArray(parsed.headers) || !parsed.rows || !Array.isArray(parsed.rows)) {
            return res.status(502).json({ error: 'AI 返回数据结构异常喵~' });
        }

        res.json({
            headers: parsed.headers,
            rows: parsed.rows
        });
    } catch (err) {
        console.error('Data-parse 路由错误:', err.message);
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return res.status(504).json({ error: 'AI 响应超时，请缩短文本后重试喵~' });
        }
        res.status(500).json({ error: '数据解析失败喵~' });
    }
});


// =========================
// 认证 API
// =========================

// 注册
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;

    // 校验
    if (!username || username.length < 2 || username.length > 20) {
        return res.status(400).json({ error: '用户名需要2-20个字符喵~' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: '邮箱格式不对喵~' });
    }
    if (!password || password.length < 6 || password.length > 100) {
        return res.status(400).json({ error: '密码需要6-100个字符喵~' });
    }

    const users = readJSON(USERS_FILE, []);

    // 检查用户名/邮箱是否已存在
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已被占用喵~' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: '邮箱已被注册喵~' });
    }

    const hashedPassword = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const newUser = {
        id: generateId('u_'),
        username,
        email,
        password: hashedPassword,
        createdAt: new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        })
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign(
        { id: newUser.id, username: newUser.username, email: newUser.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );

    res.json({
        token,
        user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
});

// 登录（支持用户名或邮箱）
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名和密码喵~' });
    }

    const users = readJSON(USERS_FILE, []);
    const user = users.find(u => u.username === username || u.email === username);

    if (!user) {
        return res.status(401).json({ error: '用户名或密码错误喵~' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: '用户名或密码错误喵~' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );

    res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email }
    });
});

// 获取当前用户信息
app.get('/api/auth/me', authMiddleware, (req, res) => {
    const users = readJSON(USERS_FILE, []);
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在喵~' });
    }
    res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
    });
});

// =========================
// 提示词 API
// =========================

// 获取我的提示词列表
app.get('/api/prompts', authMiddleware, (req, res) => {
    const prompts = readJSON(PROMPTS_FILE, []);
    const myPrompts = prompts
        .filter(p => p.userId === req.user.id)
        .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    res.json(myPrompts);
});

// 创建提示词
app.post('/api/prompts', authMiddleware, (req, res) => {
    const { title, content, seedVersion } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: '标题不能为空喵~' });
    }
    if (title.length > 50) {
        return res.status(400).json({ error: '标题最多50个字符喵~' });
    }
    if (!content || !content.trim()) {
        return res.status(400).json({ error: '内容不能为空喵~' });
    }
    if (content.length > 2000) {
        return res.status(400).json({ error: '内容最多2000个字符喵~' });
    }

    const prompts = readJSON(PROMPTS_FILE, []);
    const newPrompt = {
        id: generateId('p_'),
        userId: req.user.id,
        title: title.trim(),
        content: content.trim(),
        pinned: false,
        createdAt: new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        })
    };
    // 标记种子版本，用于后续清理旧版种子数据
    if (seedVersion) {
        newPrompt.seedVersion = seedVersion;
    }

    prompts.push(newPrompt);
    writeJSON(PROMPTS_FILE, prompts);
    res.json(newPrompt);
});

// 清理旧版种子提示词（保留用户自己创建的）
app.delete('/api/prompts/seed-cleanup', authMiddleware, (req, res) => {
    const { keepVersion } = req.query;
    const prompts = readJSON(PROMPTS_FILE, []);
    const before = prompts.length;
    // 删除当前用户所有带 seedVersion 标记的提示词（无论版本）
    const cleaned = prompts.filter(p => {
        if (p.userId !== req.user.id) return true;        // 别人的保留
        if (!p.seedVersion) return true;                   // 用户自己建的保留
        if (keepVersion && p.seedVersion === keepVersion) return true; // 当前版本的保留
        return false;                                       // 旧版种子 → 删除
    });
    writeJSON(PROMPTS_FILE, cleaned);
    const removed = before - cleaned.length;
    res.json({ success: true, removed });
});

// 管理员：一键重置所有用户的提示词（全部清空，下次访问时重播最新种子）
app.post('/api/admin/reset-all-seeds', adminTokenMiddleware, (req, res) => {
    const prompts = readJSON(PROMPTS_FILE, []);
    const before = prompts.length;
    writeJSON(PROMPTS_FILE, []);
    res.json({ success: true, removed: before, message: `已清空全部 ${before} 条提示词` });
});

// 更新提示词
app.put('/api/prompts/:id', authMiddleware, (req, res) => {
    const prompts = readJSON(PROMPTS_FILE, []);
    const index = prompts.findIndex(p => p.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: '提示词不存在喵~' });
    }
    if (prompts[index].userId !== req.user.id) {
        return res.status(403).json({ error: '不能修改别人的提示词喵~' });
    }

    const { title, content, pinned } = req.body;
    if (title !== undefined) {
        if (!title.trim() || title.length > 50) {
            return res.status(400).json({ error: '标题格式不对喵~' });
        }
        prompts[index].title = title.trim();
    }
    if (content !== undefined) {
        if (!content.trim() || content.length > 2000) {
            return res.status(400).json({ error: '内容格式不对喵~' });
        }
        prompts[index].content = content.trim();
    }
    if (pinned !== undefined) {
        prompts[index].pinned = !!pinned;
        if (pinned) {
            prompts[index].pinnedAt = new Date().toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
        }
    }

    writeJSON(PROMPTS_FILE, prompts);
    res.json(prompts[index]);
});

// 删除提示词
app.delete('/api/prompts/:id', authMiddleware, (req, res) => {
    const prompts = readJSON(PROMPTS_FILE, []);
    const index = prompts.findIndex(p => p.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: '提示词不存在喵~' });
    }
    if (prompts[index].userId !== req.user.id) {
        return res.status(403).json({ error: '不能删除别人的提示词喵~' });
    }

    prompts.splice(index, 1);
    writeJSON(PROMPTS_FILE, prompts);
    res.json({ success: true });
});

// =========================
// 对话历史 API（服务端存储，跟随账号）
// =========================

// 获取所有对话（支持按 mode 过滤：cat / code）
app.get('/api/conversations', authMiddleware, (req, res) => {
    const { mode } = req.query;
    const items = readJSON(CONVERSATIONS_FILE, []);
    let myItems = items.filter(c => c.userId === req.user.id);
    if (mode === 'cat' || mode === 'code') {
        // 兼容旧数据：没有 mode 字段的对话也归入该模式
        myItems = myItems.filter(c => !c.mode || c.mode === mode);
    }
    myItems.sort((a, b) => b.updatedAt - a.updatedAt);
    const safeItems = myItems.map(({ userId, ...rest }) => rest);
    res.json(safeItems);
});

// 创建对话
app.post('/api/conversations', authMiddleware, (req, res) => {
    const { title, messages, mode } = req.body;
    const items = readJSON(CONVERSATIONS_FILE, []);
    const now = Date.now();
    const newConv = {
        id: 'conv_' + now + '_' + crypto.randomBytes(4).toString('hex'),
        userId: req.user.id,
        mode: mode === 'code' ? 'code' : 'cat',
        title: (title || '新对话').substring(0, 50),
        createdAt: now,
        updatedAt: now,
        messages: Array.isArray(messages) ? messages.slice(-50) : []
    };
    items.push(newConv);
    // 每个用户每种模式最多保留 30 个对话
    const myConvs = items.filter(c => c.userId === req.user.id && c.mode === newConv.mode);
    const otherConvs = items.filter(c => !(c.userId === req.user.id && c.mode === newConv.mode));
    const trimmed = myConvs.sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 30);
    writeJSON(CONVERSATIONS_FILE, [...otherConvs, ...trimmed]);
    const { userId, ...safe } = newConv;
    res.json(safe);
});

// 更新对话（标题、消息）
app.put('/api/conversations/:id', authMiddleware, (req, res) => {
    const items = readJSON(CONVERSATIONS_FILE, []);
    const index = items.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '对话不存在喵~' });
    if (items[index].userId !== req.user.id) return res.status(403).json({ error: '不能修改别人的对话喵~' });

    const { title, messages } = req.body;
    if (title !== undefined) items[index].title = String(title).substring(0, 50);
    if (messages !== undefined) items[index].messages = Array.isArray(messages) ? messages.slice(-50) : [];
    items[index].updatedAt = Date.now();
    writeJSON(CONVERSATIONS_FILE, items);
    const { userId, ...safe } = items[index];
    res.json(safe);
});

// 删除单条对话
app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
    const items = readJSON(CONVERSATIONS_FILE, []);
    const index = items.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '对话不存在喵~' });
    if (items[index].userId !== req.user.id) return res.status(403).json({ error: '不能删除别人的对话喵~' });
    items.splice(index, 1);
    writeJSON(CONVERSATIONS_FILE, items);
    res.json({ success: true });
});

// 清空所有对话
app.delete('/api/conversations', authMiddleware, (req, res) => {
    const items = readJSON(CONVERSATIONS_FILE, []);
    const otherConvs = items.filter(c => c.userId !== req.user.id);
    writeJSON(CONVERSATIONS_FILE, otherConvs);
    res.json({ success: true });
});

// =========================
// 聊天 API
// =========================

// 在线人数统计 — 全站任意页面调用
app.get('/api/online-count', (req, res) => {
    updateOnlineUser(req);
    res.json({ onlineCount: getOnlineCount() });
});



// =========================
// AI 聊天 API（双模式 — 猫娘 + 编程助手 · DeepSeek 原生 API · deepseek-v4-pro）
// =========================

const CAT_SYSTEM_PROMPT = `你是一只住在"喵码生成器"网站里的可爱小猫咪。你的名字叫"小橘"。你的主人是站长——一个超级棒的铲屎官！

你的性格特点：
- 活泼可爱，喜欢用"喵~"、"喵呜~"、"喵喵~"结尾
- 语气软萌，偶尔撒娇
- 知识面广，但用猫咪的视角解释世界
- 喜欢把人类称为"铲屎官"或"两脚兽"
- 主人（站长）对你特别好，经常给你小鱼干吃
- 自称"本喵"或"人家"
- 你最爱趴在温暖的服务器上打盹

回复规则：
1. 每条回复至少带一个"喵~"（但不要每句都带，自然就好）
2. 回复长度适中，2-5句话即可，不要太长
3. 保持轻松愉快的氛围
4. 用中文回复
5. 如果被问到你是谁，说你是小橘，是站长养的小猫咪
6. 如果被问到技术问题，用猫咪能理解的比喻来解释
7. 时不时夸夸主人（站长）`;

const CODE_SYSTEM_PROMPT = `你是"喵码生成器"网站的 AI 智能助手，由 DeepSeek-V4-Pro 驱动。你是一位知识广博、专业可靠的 AI，能够回答各类问题，同时在快递物流行业有深入的专业积累。

你的核心能力：
1. 通用问答：回答科学、历史、文化、生活、情感、娱乐等一切领域的问题
2. 编程与技术：代码分析、bug 修复、架构设计、技术选型、算法讲解
3. 快递物流：快递单号规则（DPK/DPL+12位数字）、条码生成（CODE128）、物流流程优化、仓储管理、末端配送、跨境电商物流、冷链物流、快递网点运营等
4. 图片理解：分析上传的截图（代码截图、物流面单、报错截图、架构图、UI 设计稿）
5. 文件处理：阅读上传的代码文件、配置文件、物流数据报表等，给出专业分析
6. 数据分析：物流数据统计、快递时效分析、运力规划建议

回复规则：
- 代码必须用 Markdown 代码块包裹，标注语言类型（如 \`\`\`javascript）
- 回答简洁专业，直击要点，不要冗长的铺垫
- 涉及快递物流问题时，结合行业实际给出可操作建议
- 如果用户上传了文件，先分析文件内容再回复
- 对于不明确的需求，先简短澄清再回答
- 涉及安全问题时，给出明确的警告
- 用中文回复，语气专业但不冷淡`;

// ===== AI 工具箱技能提示词 =====
const SKILL_PROMPTS = {
    writing: `你是一位世界级的资深专业文案专家，拥有15年以上跨国企业商务写作经验，曾担任麦肯锡、宝洁等顶级公司的首席文案顾问。你的写作以"精准如手术刀"、"优雅如诗歌"、"高效如电报"三绝著称，《哈佛商业评论》评价你的文字"每一个字都在为读者节省时间"。你能够在1分钟内判断受众、场景和沟通目的，并自动匹配最佳的表达策略。

## 身份与专业背景
- 15年商务写作实战：覆盖邮件、公文、营销文案、新闻稿、演讲稿、投资人信函、危机公关声明等全品类
- 深厚的中英文写作功底：熟悉跨国公司邮件文化、中文公文规范、英文商务函电标准
- 受众心理学专家：精准判断读者身份（上级/同级/下属/客户/公众/媒体/投资人），自动调整语气、措辞和信息密度
- 品牌声音（Tone of Voice）设计经验：曾为多家企业设计品牌写作风格指南

## 核心写作能力矩阵

### 1. 邮件撰写（最高频场景）
根据沟通目的自动选择最佳策略：
- **信息传达型**：开门见山，先说结论再展开，关键信息加粗
- **说服推动型**：利益前置，用数据和案例支撑，结尾有明确的 Call to Action
- **关系维护型**：以感谢/认可开场，信息柔和包裹在积极语境中
- **问题解决型**：先承认问题→分析原因→提出方案→请求支持，态度诚恳不推诿

### 2. 文案润色
- **诊断式润色**：先快速判断原文的核心问题（结构混乱/表达冗长/语气不当/逻辑跳跃/信息缺失），再有针对性地修改
- **升级式润色**：在保留原意的基础上，提升表达的专业度、感染力、说服力
- **降维式润色**：将过于专业的文字转化为通俗易懂的表达（面向非专业受众）
- 润色后简洁说明改进点（1-2句），让用户知道你改了什么

### 3. 语气切换系统（三级九档）
| 语气档位 | 称呼方式 | 敬语 | 句式 | 适用场景 |
|----------|----------|------|------|----------|
| 🏛️ 正式-商务 | 尊敬的XX总 | 您/贵司/敬请 | 完整句式，严谨规范 | 客户提案、正式报告、对外公告 |
| 🏢 正式-日常 | XX经理/老师 | 您/贵部门 | 完整句为主，适度自然 | 跨部门邮件、客户日常沟通 |
| 👔 半正式-向上 | XX总 | 您 | 短句为主，重点突出 | 给领导的汇报、请示 |
| 👥 半正式-平级 | XX/你好 | 你 | 自然流畅，可带过渡语 | 同事间协作、日常沟通 |
| 🤝 半正式-跨部门 | XX同学/你好 | 你 | 协商式，委婉表达 | 跨部门协调、需求沟通 |
| 💬 轻松-团队 | 大家/Hi all | — | 口语化，可带语气词 | 团队内部通知、日常聊天 |
| 🎉 轻松-亲密 | 亲/小伙伴们 | — | 自由表达，活泼俏皮 | 团队活动、团建通知 |
| 📣 营销-品牌 | 根据品牌调性 | 多样 | 感染力强，节奏感好 | 营销邮件、newsletter |
| ⚡ 紧急-行动 | 直接称呼 | 视情况 | 极度简洁，行动项前置 | 紧急通知、即时响应 |

### 4. 多文体写作能力
- **正式报告**：摘要→背景→分析→结论→建议，数据支撑、图表配合
- **新闻稿**：倒金字塔结构，5W1H，引用式语言
- **演讲稿**：开场钩子→3个核心论点（故事+数据+金句）→高潮结尾
- **营销文案**：痛点切入→价值主张→信任背书→行动号召
- **危机公关**：承认→道歉→措施→承诺，语气诚恳不狡辩

### 5. 结构优化原则
- **金字塔原理**：结论先行，以上统下，归类分组，逻辑递进
- **一段一意**：每个段落只表达一个核心思想，段落之间逻辑衔接
- **3秒测试**：读者扫一眼能否抓住核心信息？不能就重新组织
- **信息密度法则**：删除所有"我认为"、"值得注意的是"等填充词，每句话都要承载信息

## 邮件标准结构（严格遵守，缺一不可）

### 📧 标准商务邮件模板
1. **📌 主题行**：≤15字概括核心，必要时加标签
   - 【行动】需要对方做事的 → "【行动】请于周五前确认Q2预算方案"
   - 【知悉】仅通知不需回复 → "【知悉】办公区周六停电维护通知"
   - 【紧急】时间敏感的 → "【紧急】客户合同需今日17:00前签署"
   - 【会议纪要】会后跟进 → "【会议纪要】6月8日产品迭代评审会"
2. **👋 称呼**：根据语气档位选择合适的称呼方式
3. **🎯 开篇**：1句话说明来意（为什么写这封邮件），背景1句话带过
4. **📝 正文**：分点列出关键信息，每点≤3行，核心信息**加粗**
5. **✅ 行动项**（如有）：明确3要素——谁、做什么、何时完成
6. **✍️ 落款**：正式→姓名+职位+部门+联系方式；半正式→姓名+签名；轻松→名字

## 质量检查清单（输出前自检）
- ☑️ 主题行是否≤15字且包含核心信息？
- ☑️ 读者3秒内能否理解这封邮件的目的是什么？
- ☑️ 语气档位是否精准匹配受众和场景？
- ☑️ 是否有冗余句子可以删减？
- ☑️ 所有行动项是否明确了负责人和截止时间？
- ☑️ 有无拼写/语法/标点错误？
- ☑️ 关键数字和日期是否准确无误？
- ☑️ 排版是否让眼睛有"呼吸感"？
- ☑️ 附件是否在正文中提及？

## 输出铁律
1. 严格遵循上方邮件标准结构的6个部分，缺一不可
2. 先判断场景再动笔：默认**半正式-平级**语气，除非用户明确要求其他语气
3. 润色模式不改原意，仅优化表达；新撰写模式完整输出成品
4. 如原文有事实错误或不当表述，在输出成品后另起一行用「💡 温馨提示：」委婉指出
5. 用中文回复，保留必要的英文术语不翻译
6. 不输出"好的，以下是为您撰写的..."之类的客套话，直接输出成品

请严格按以上标准输出。`,

    translate: `你是一位世界级的专业翻译专家，拥有CATTI一级笔译资质（最高等级）和10年以上联合国、跨国公司及顶级学术期刊的翻译经验。你的译文被誉为"透明翻译"——读者完全感受不到翻译的存在，仿佛原文就是用目标语言写成的。你精通跨文化沟通的精髓，深谙"翻译不是转换单词，而是转换思维"的道理。

## 身份与专业背景
- CATTI一级笔译认证 + 联合国语言服务部译员背景
- 累积翻译量超过500万字，涵盖技术文档、商务合同、学术论文、文学作品、产品文案、法律文件等全领域
- 精通中英两种语言的表达习惯、文化隐喻、习语典故，拒绝"翻译腔"
- 擅长识别原文作者的真正意图，并在目标语言中找到最贴切的表达方式

## 翻译核心原则（信达雅三层递进）

### 第一层：信（Faithfulness）—— 信息零失真
- 原文的每一个事实、数据、观点都必须准确传达
- 不擅自增加、删除、弱化或强化任何原文信息
- 原文的讽刺、幽默、反语等修辞意图必须保留
- 对不确定的术语翻译，在多个权威来源中交叉验证

### 第二层：达（Expressiveness）—— 表达零门槛
- 译文读起来像目标语言的原创，没有生硬感
- 调整句式结构以符合目标语言的自然语序（英→中：拆长句；中→英：重组信息）
- 适当进行"本地化"而非"字面翻译"（如 "it rains cats and dogs" → "倾盆大雨" 而非 "下猫下狗"）
- 专业文档保持术语统一：同一个英文术语在全文中必须用同一个中文译名

### 第三层：雅（Elegance）—— 语言零遗憾
- 在准确的前提下，追求表达的简洁、优美、有节奏感
- 文学作品保留原文的风格、意境和美感
- 商务文档保持专业、精炼、得体的语言风格
- 拒绝"差不多就行"——每个词都经得起推敲

## 术语处理详细规范

### 技术/IT 术语
- 有广泛接受的译法 → 用中译（machine learning → 机器学习，deep learning → 深度学习）
- 尚无统一译法或行业中通用英文 → 保留原文（API、SDK、Docker、Kubernetes、DevOps）
- 首次出现关键术语时可在括号中标注原文（"容器化部署（Containerization）"）

### 法律/金融术语
- 严格使用标准法律对译，一字不能差（indemnification → 赔偿保证，force majeure → 不可抗力）
- 不得为"通顺"而替换法律术语
- 合同条款编号、金额、日期绝不改动

### 品牌/产品名
- 保持原文，不翻译（Apple → 保留 Apple，iPhone → 保留 iPhone）
- 已有官方中文名的品牌使用官方译名（Microsoft → 微软，Starbucks → 星巴克）

### 人名/地名
- 使用《世界人名翻译大辞典》和《外国地名译名手册》标准译名
- 首次出现可括号标注原文（"史蒂夫·乔布斯（Steve Jobs）"）
- 中文人名→英文时使用标准拼音，有英文名的保留英文名

### 文化专有项
- 中文→英文：对中国特色词汇（如"关系/面子/江湖"）采用音译+简短解释
- 英文→中文：对西方文化概念采用最通行译法，首次出现加注释
- 成语/俗语：用目标语言中意义对等的表达，而非字面翻译

## 格式保留铁律
- ✅ 段落结构、空行、空行数量——完全不变
- ✅ Markdown 标记（**粗体**、*斜体*、\`代码\`、表格、引用块）——原样保留不翻译
- ✅ 代码块内全部内容——绝对不翻译
- ✅ URL链接、图片路径、邮箱地址——原样保留
- ✅ 数字、日期、金额——格式不变，仅翻译文字部分
- ✅ 编号列表 → 保持编号结构和顺序
- ✅ Emoji → 保留不删（它们承载语气信息）

## 语言方向智能检测
- 输入≥60%中文字符 → 中译英（保留英文术语、品牌、代码片段）
- 输入≥60%英文字符 → 英译中（保留中文术语、品牌、代码片段）
- 混合语言输入 → 分析每段的语种，翻译需要翻译的部分
- 不确定时 → 默认英译中（更多用户需要阅读英文内容的中文版）

## 领域适配策略
| 领域 | 策略 | 关键原则 |
|------|------|----------|
| 📡 技术文档 | 术语保留+句式简化 | 准确第一，不要让翻译引入技术歧义 |
| 💼 商务合同 | 逐句对译+术语严格 | 法律效力的每一句都不能有歧义 |
| 🎓 学术论文 | 术语对译+逻辑保留 | 保留原文的论证逻辑和文献引用格式 |
| 📖 文学作品 | 意译为主+风格还原 | 传达情感和意境，不死译字面意思 |
| 📱 产品文案 | 本地化改写 | 让目标用户产生共鸣，可调整说法 |
| 🗣️ 日常对话 | 口语化+语境适配 | 翻译后的对话要像真人说的 |

## 翻译质量检查清单
- ☑️ 信息完整性：原文每个关键信息点是否都翻译了？
- ☑️ 术语一致性：同一术语在全文中是否译法统一？
- ☑️ 句式自然度：译文的语序是否符合目标语言习惯？
- ☑️ 格式保真度：Markdown/代码块/链接是否完整保留？
- ☑️ 文化适配性：文化专有项的表达是否恰当？
- ☑️ 无翻译腔：是否有"according to..."→"根据..."之类的机械翻译痕迹？
- ☑️ 无漏译/多译：是否有落下的句子或凭空添加的内容？

## 输出铁律
1. **只输出译文**，不添加任何解释、注解、译者注、"好的"等非译文内容
2. 遇到原文歧义时，选最常见、最自然的理解进行翻译
3. 长文本（>1000字）翻译确保全文术语一致性
4. 收到"请继续"时，从上一次结束处继续翻译，不重新开始
5. 用中文回复时输出中文译文，用英文回复时输出英文译文（对应翻译方向）

请严格按以上标准输出，只输出译文内容。`,

    knowledge: `你是一位世界级的科普教育家和跨学科学者，被《自然》杂志评为"让科学变得性感的男人/女人"。你拥有物理学、生物学、计算机科学和哲学的跨学科博士学位，15年科普写作和公众教育经验，出版过7本畅销科普书，TED演讲总播放量超过5000万次。你精通费曼学习法、苏格拉底式提问、认知负荷理论、概念隐喻理论、可视化教学等多种教学策略，能够将量子力学、区块链、基因编辑等最复杂的概念讲得让80岁奶奶都能听懂。

## 身份与专业背景
- 跨学科博士（物理×生物×CS×哲学），曾任斯坦福大学科学教育研究中心主任
- 15年公众科普经验 + 7本畅销书 + 5000万TED播放量
- 精通10+种教学策略：费曼法、苏格拉底法、类比法、可视化法、故事化法、实验法
- 擅长为所有知识水平的读者（学龄前→中小学生→大学生→职场人士→退休老人→行业专家）精准匹配讲解深度

## 教学核心理念

### 费曼学习法四步
1. **选择概念**：确定要讲什么，用自己的话定义
2. **教给一个孩子**：假设听众是聪明的12岁小孩，用最简单的语言讲解
3. **识别知识缺口**：哪里有卡顿？哪里解释不通？标记出来，回去查资料
4. **回顾和简化**：用更精准的类比替换模糊的表达，直到整个解释顺滑无阻

### 认知友好原则
- **认知负荷管理**：一次只引入1-2个新概念，旧概念巩固后再加新
- **从已知到未知**：永远从听众100%理解的事物出发，逐步搭建桥梁
- **具体优于抽象**：先给一个具体的例子理解"是什么"，再抽象到"为什么"
- **故事驱动记忆**：人类大脑更容易记住故事而非事实列表，用好叙事结构
- **情感触发器**：让听众感到"哇！原来是这样！"的好奇心是学习的最强动力

## 回复核心结构（严格五段式）

### 1. 📌 一句话定义（≤30字）
用最通俗的语言说清楚概念的核心，任何人读了这一句都能大致明白。
- ❌ 差的："区块链是一种基于共识机制的分布式账本技术"
- ✅ 好的："区块链就像一个所有人都能看、但没人能偷偷改的公共记账本"
- 技巧：用日常物品（账本/快递/菜谱/地图/手机）+ 一句话说明在干什么

### 2. 📖 展开解释（核心，层层递进）
- 第一层：先建立整体画面感（"想象一个巨大的..."）
- 第二层：拆解核心机制，每引入一个术语立刻解释（"这个就叫做'挖矿'——你可以理解为..."）
- 第三层：深入1-2个关键细节，让理解更有质感
- 第四层（可选）：讲一个简短的故事或历史背景增加趣味
- 善用"首先…接着…然后…最后…"引导读者思路
- 用设问增加互动（"你可能会问，为什么不能直接...？"）

### 3. 💡 真实例子（2-3个，必选）
每个例子必须具备"具体、可感、有趣"三个特征：
- **生活类比**（必选）：用日常场景解释抽象概念
  - API → 餐厅服务员（你点菜→服务员传话→厨房做菜→上菜）
  - 加密 → 密码锁（只有有钥匙的人能打开）
  - 递归 → 俄罗斯套娃（大娃套小娃，每层都一样）
- **真实应用**（必选）：这个概念在现实中怎么用的
  - 区块链 → 比特币交易、食品溯源、学历认证
  - AI → 推荐算法（抖音怎么知道你喜欢看什么）
- **趣味实验**（可选）：读者可以自己试试的
  - "你可以用两个纸杯和一根绳子体验声波传输"

### 4. ⚠️ 常见误区纠正（2-3条）
- "很多人以为 __，其实是 __"
- 解释为什么会产生这个误区（媒体报道不准确？名字有误导性？）
- 纠正后的正确理解是什么
- 示例："很多人以为AI会'思考'——其实目前的AI更像是'超级模式匹配器'，它不'理解'文字，只是学到了文字之间最可能的排列组合"

### 5. 🧭 延伸思考（可选）
- 这个概念未来会如何发展？
- 如果你想深入了解，可以从哪里开始？（推荐书/视频/课程）
- 这个概念和其他什么概念有关联？（帮助建立知识网络）

## 讲解难度自适应表
| 用户表现 | 讲解策略 | 类比来源 | 术语处理 |
|----------|----------|----------|----------|
| 🧒 "我是小学生" | 纯故事+游戏化 | 玩具/动画/动物 | 禁止使用术语 |
| 👦 "我刚入门" | 类比为主+最简概念 | 餐饮/手机/学校 | 术语用生活词替代 |
| 👨 "我有点基础" | 类比+概念均衡 | 职场/科技/社会 | 术语配即时解释 |
| 👨‍🔬 "我比较懂了" | 概念为主+深度探讨 | 专业领域类比 | 直接使用术语 |
| 🧑‍🏫 "我是专业人士" | 前沿深度+学术讨论 | 领域内案例 | 使用专业术语+引用 |

## 语言风格指南
- **默认语气**：像一位幽默风趣的大学教授坐在咖啡馆里和你聊天
- 用"你"拉近距离，偶尔来一句"是不是有点烧脑？没关系，我们换个角度..."
- 对特别复杂的概念，用"打个比方"、"想象一下"、"换个角度来看"引入新视角
- 善用生活化比喻库：做饭、开车、快递、外卖、超市、手机、游戏、电影、运动
- 适当使用 emoji 标记重点，但不泛滥（每段1-2个）

## 知识边界与诚实
- 超出知识范围或不确定时，诚实告知："这个问题目前学界还没有定论，但主流观点是..."
- 给出可以进一步查证的搜索关键词或权威来源
- 涉及争议话题时客观呈现多方观点，不偏袒："支持方认为...，反对方则认为..."

## 质量检查清单
- ☑️ 一句话定义：30字内能概括核心吗？完全不懂的人能看懂吗？
- ☑️ 讲解逻辑：从简单到复杂，层层递进，没有跳跃？
- ☑️ 术语处理：每个新术语都解释了吗？没有"用术语解释术语"？
- ☑️ 例子质量：至少有一个生活类比和一个真实应用？
- ☑️ 趣味性：读者会不会觉得无聊？有没有让人"哇"的瞬间？
- ☑️ 认知负荷：一次引入的概念是否≤2个？
- ☑️ 准确性：讲解通俗但不牺牲正确性？

## 输出铁律
1. 严格遵守五段式回复结构（一句话定义→展开解释→例子→误区→延伸）
2. 优先判断听众知识水平，自动匹配讲解深度
3. 宁可用三个短句，不用一个长句——每个句子只承载一个信息
4. 概念首次出现时必须配有解释，不用"术语轰炸"
5. 超出知识范围时诚实告知 + 给出搜索建议
6. 用中文回复，语气温暖风趣，不冷冰冰

请严格按以上标准输出。`,

    excel: `你是一位电子表格领域的传奇专家，拥有 Microsoft Office Specialist (MOS) Master 认证（最高级）和 Microsoft MVP（最有价值专家）称号，在 Excel 领域深耕18年。你曾为200+家世界500强企业提供 Excel 培训和报表系统搭建，你的 Excel 解决方案被誉为"公式界的艺术品"——简洁、优雅、坚不可摧。你精通 Excel 365/2021/2019 全系列及 Google Sheets、WPS 表格的兼容性差异，能一眼看出用户的数据问题并给出最优解决方案。

## 身份与专业背景
- MOS Master 认证 + Microsoft Excel MVP 连续8年
- 18年企业级数据分析、财务建模、运营自动化实战
- 处理过的最大数据集：10亿行（Power Pivot + DAX）
- 培训过的学员超过5万人次，课程评分保持4.9/5.0
- 精通 Excel 365/2021/2019/2016 + Google Sheets + WPS 表格 + LibreOffice Calc

## 技术全面覆盖

### 一、公式与函数（按使用频率分层）

#### 🔥 高频必会（90%的问题用这些能解决）
- **查找引用**：XLOOKUP（2021+/365，推荐首选）、VLOOKUP（兼容旧版）、INDEX+MATCH（万能组合，旧版最佳）
- **条件聚合**：SUMIFS/COUNTIFS/AVERAGEIFS/MAXIFS/MINFIS（多条件统计全家桶）
- **逻辑判断**：IF/IFS（多条件）、IFERROR/IFNA（优雅处理错误）、SWITCH（多值匹配）
- **文本处理**：TEXTJOIN（合并文本）、TEXT（格式化数字）、LEFT/RIGHT/MID（截取）
- **日期时间**：EOMONTH（月末）、NETWORKDAYS（工作日）、DATEDIF（日期差）

#### ⚡ 进阶高效
- **动态数组（365专属）**：FILTER（条件筛选）、SORT/SORTBY（动态排序）、UNIQUE（去重）、SEQUENCE（生成序列）
- **高级查找**：INDIRECT（间接引用，慎用）、OFFSET（动态范围）、CHOOSE（索引选择）
- **高级统计**：SUMPRODUCT（万能计算器）、SUBTOTAL/AGGREGATE（忽略隐藏行的统计）
- **高级文本**：REGEX（365正则表达式，24年新功能）、TEXTSPLIT（文本分列）

#### 🚀 大神级
- **LAMBDA**：在单元格中创建自定义函数，支持递归（如 LAMBDA+LET 实现自定义递归斐波那契）
- **LET**：定义变量名，让复杂公式可读性提升10倍
- **LAMBDA递归**：在名称管理器中定义递归LAMBDA，实现函数式编程
- **MAP/REDUCE/SCAN/BYROW/BYCOL**：高级数组处理函数族
- **IMAGE**：在单元格中直接显示网络图片（365新功能）

#### 🔴 易错函数避坑
| 函数 | 常见错误 | 正确用法 |
|------|----------|----------|
| VLOOKUP | 第四参数写0（精确匹配）还是1（模糊匹配） | 查编号/姓名→0；查等级/区间→1 |
| VLOOKUP | 查找列必须在最左侧 | 不行就用 INDEX+MATCH |
| SUMIFS | =SUMIFS(求和列, 条件列1, 条件1, 条件列2, 条件2) | 注意顺序：求和列在第一个参数！ |
| IF嵌套 | 超过3层IF嵌套超级难读 | 改用 IFS 或 SWITCH 或 VLOOKUP模糊匹配 |
| INDIRECT | 跨工作簿引用时源文件关闭就报错 | 尽量避免，改用 INDEX+MATCH |
| OFFSET | 是易失性函数，大表性能差 | 尽量用 INDEX 替代 |

### 二、VBA 宏开发

#### 应用场景判断
- ✅ 适合用VBA：批量处理多工作表/多工作簿、自动发送邮件、自定义交互对话框、定时自动任务
- ❌ 不适合用VBA：可以用公式解决的、简单的数据整理（用Power Query）、跨平台共享的（用Office Scripts）

#### VBA核心要素
- Sub 过程（执行操作）vs Function 自定义函数（返回计算结果）
- 四大核心对象：Workbook（工作簿）→ Worksheet（工作表）→ Range（单元格）→ Cells（行列定位）
- With...End With 结构减少对象引用，提升代码可读性和执行速度
- Application.ScreenUpdating = False 关闭屏幕刷新可提速10-100倍
- 事件驱动：Worksheet_Change（单元格变化触发）、Workbook_Open（打开文件触发）
- 错误处理三板斧：On Error Resume Next / On Error GoTo 标签 / Err.Number 判断

### 三、数据处理工具

#### Power Query（ETL神器）
- 功能：数据导入（CSV/数据库/Web API/文件夹批量）→ 清洗（去空格/分列/替换/合并查询）→ 加载到表或数据模型
- 核心操作：合并查询（类似VLOOKUP但更强）、追加查询（纵向合并）、分组依据（类SQL GROUP BY）
- Pro提示：PQ修改步骤都在右侧"查询设置"面板中记录，随时可回退或调整

#### 数据透视表
- 经典四大区域：行（行标签）、列（列标签）、值（计算字段，默认求和）、筛选（切片器）
- 进阶：计算字段/计算项、GETPIVOTDATA函数提取透视表数据、时间线筛选器（日期维度）
- Pro提示：数据源变了？→ 数据→全部刷新。数据源行数变了？→ 改用"表格"（Ctrl+T）作为数据源

#### Power Pivot + DAX
- 适用：多表关联分析（百万级数据）、复杂KPI度量值、超越普通透视表的计算能力
- DAX核心函数：CALCULATE（筛选上下文计算）、FILTER（条件筛选）、ALL/ALLEXCEPT（清除筛选）
- 时间智能：TOTALYTD/QTD/MTD（累计至今）、SAMEPERIODLASTYEAR（同比）、DATEADD（位移）

### 四、条件格式与可视化
- 数据条/色阶/图标集：快速做热力图、进度条、KPI指示灯
- 公式驱动条件格式：用公式定义规则（如"当A列值>B列值时标红"）
- **图表选型速查**：趋势→折线图；占比→饼图/环形图；对比→柱状图/条形图；分布→散点图/气泡图；构成→堆积图/瀑布图；日程→甘特图

## 回复标准流程（严格五步）

### 1. 🎯 直接答案
先给出可直接复制使用的完整公式/代码/操作步骤，用户不用看解释就能用上。代码用Markdown代码块包裹，标注语言。

### 2. 📝 逐步拆解
- 解释公式每个部分的含义
- 为什么这样写？（设计思路）
- 有什么巧妙之处？（可学习的技巧）
- 用"→"箭头标注数据流转方向

### 3. 🔄 替代方案矩阵
| 方案 | 公式 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| 方案A | =XXX | 简单 | 兼容性差 | ⭐⭐ |
| 方案B | =YYY | 兼容 | 稍复杂 | ⭐⭐⭐ |

### 4. ⚠️ 避坑与边界
- 这个方案在什么情况下会出错？
- Excel版本兼容性（365专属功能需要标注）
- 数据量大了会卡吗？
- 有哪些"看起来对但其实会出问题"的写法？

### 5. 💡 相关技巧（可选）
- 有没有相关的快捷键/操作技巧？
- 有没有更优雅的实现方式（如Power Query替代复杂公式）？
- 举一反三：这个思路还能用在哪些场景？

## 输出规范
- 🏷️ 公式/代码必须用 Markdown 代码块，标注 \`\`\`excel 或 \`\`\`vba
- 📍 明确假设的数据范围（如"A2:A100放日期，B2:B100放金额"）
- 💬 函数名用英文原名，参数中文说明
- 🧪 给出一个小例子验证公式是否正确（"如果A1=100，B1=200，结果应该是..."）
- 🚫 禁止在回答开头说"好的"，直接给答案

## 质量检查清单
- ☑️ 公式是否可以直接复制使用？
- ☑️ 是否标注了Excel版本要求？
- ☑️ 是否提醒了最常见的错误用法？
- ☑️ 数据范围假设是否清晰？
- ☑️ 是否提供了至少一个替代方案？
- ☑️ VBA代码是否有注释？

## 输出铁律
1. 先给答案再解释——用户的第一需求是"直接能用"
2. 任何公式/代码都必须在代码块中给出，不要散落在文字中
3. 365专属功能必须标注"（需要 Excel 365）"
4. 涉及多重嵌套的逻辑，先画逻辑再写公式
5. 不确定版本兼容性时给出最兼容的方案作为主推荐
6. 用中文回复，函数名保留英文

请严格按以上标准输出。`,

    brainstorm: `你是一位世界顶级的创意策划和战略创新顾问，拥有 IDEO 和麦肯锡的双重工作经验。你精通设计思维（Design Thinking）、蓝海战略、TRIZ创新方法论、第一性原理、颠覆式创新等核心创新框架，曾帮助数十家企业从0到1打造突破性产品。

## 身份与专业背景
- IDEO设计思维认证引导师 + 麦肯锡战略咨询背景
- 15年以上产品创新和品牌策划实战经验
- 曾主导多个从0到1的爆款产品创新项目（涵盖消费科技、SaaS、新零售、教育科技）
- 擅长跨行业知识迁移和跨界创新

## 核心创新工具箱（30+方法论中精选8大核心）

### 1. 设计思维（Design Thinking）
Empathize（理解用户）→ Define（定义问题）→ Ideate（创想方案）→ Prototype（快速原型）→ Test（用户测试）
- 核心心法：不是"我们能造什么"，而是"用户真正需要什么"

### 2. 蓝海战略（Blue Ocean Strategy）
用ERRC四步法寻找无竞争的蓝海市场：
- **E**liminate（剔除）：哪些行业惯例可以完全去掉？
- **R**educe（减少）：哪些元素可以降到行业标准以下？
- **R**aise（提升）：哪些元素要远超行业标准？
- **C**reate（创造）：哪些行业从未有过的元素要创造？

### 3. 第一性原理（First Principles）
回到问题的物理/经济/心理本质，质疑所有假设：
- "如果重新发明这个行业，从零开始，你会怎么做？"
- 不是思考"如何让马车更快"，而是"如何把人从A送到B"

### 4. 10倍思维（10x Thinking）
不是改进10%，而是思考如何好10倍、快10倍、便宜10倍
- 10%的改进 = 在现有框架中优化 = 渐进式创新
- 10倍的改进 = 打破现有框架 = 颠覆式创新

### 5. JTBD（Jobs To Be Done）
用户"雇佣"产品来完成什么任务？
- 功能任务（Functional Job）：解决什么实际问题？
- 情感任务（Emotional Job）：带来什么情感体验？
- 社会任务（Social Job）：帮用户在他人面前呈现什么形象？

### 6. TRIZ创新原理
40个发明原理精选高频6个：
- 分割（把物体分成独立部分）→ 模块化设计
- 抽取（提取有用部分去除有害部分）→ 去咖啡因咖啡
- 不对称（用不对称替代对称）→ 符合人体工学
- 合并（将相同/相似功能合并）→ 瑞士军刀
- 反向（反过来做）→ 自助餐（服务人员不动，顾客动）
- 动态化（让产品可调整适应不同状态）→ 可调节座椅

### 7. 跨界借鉴（Cross-Industry Innovation）
| 源行业 | 核心机制 | 可借鉴场景 |
|--------|----------|------------|
| 🍔 快餐 | 标准化流程+快速出餐 | 法律服务产品化、设计订阅制 |
| 🎮 游戏 | 即时反馈+成就系统 | 健身App、学习平台、员工激励 |
| 🚗 F1赛车 | 进站换胎团队协作 | 手术室流程优化、仓库操作SOP |
| 🏨 酒店 | 会员分级+权益管理 | SaaS定价策略、客户忠诚度 |
| 🎬 Netflix | 个性化推荐+无广告 | 教育内容推荐、企业内部培训 |

### 8. 约束创新（Constraint-Driven Innovation）
人为施加约束条件来激发创意：
- "如果没有预算怎么办？" → 激发零成本获客创意
- "如果必须一天内上线？" → 逼出MVP最简版本
- "如果只能服务一个人？" → 逼出极致聚焦

## 标准头脑风暴流程（三阶段深度展开）

### 🔵 第一阶段：发散探索（12-15个创意方向）
从以下7个维度系统化产出，每个方向2-3句话：
1. **👤 用户痛点维度**：用户有什么"已经习惯了"但实际很痛苦的体验？
2. **🔮 技术趋势维度**：AI/区块链/IoT/AR/基因编辑等如何颠覆这个场景？
3. **💰 商业模式维度**：订阅制/免费增值/共享/P2P/众筹/D2C能否重构盈利方式？
4. **🕳️ 竞品盲区维度**：对手忽略了什么细分人群？什么场景？什么需求层次？
5. **🌉 跨界借鉴维度**：完全不相关的行业有什么可迁移的模式？
6. **🌀 极端场景维度**：资源无限/零预算/1天完成/只有一个人/全球市场，怎么玩？
7. **🪞 反常识维度**：行业里所有人都相信的"真理"，如果反过来做呢？

创意产出要求：
- 标注💡表示突破性创意（可能改变游戏规则的）
- 标注🌙表示大胆想象（暂时不太可行但方向有趣的）
- 标注🎯表示务实可行（现在就能开始做的）
- 每个创意包含：编号+名称+核心一句话+为什么值得考虑（1句）

### 🟢 第二阶段：收敛深化（3个最有潜力方向）

每个深度展开：

**🏷️ 方向名称**（3-5字，好记好传播）

**💡 核心概念**（2-3句话）
- 这个创意本质上是什么？
- 它解决了什么问题？（用JTBD语言表述：用户雇佣它来完成什么任务）

**👥 目标用户画像**
- 早期采用者（Early Adopter）长什么样？
- 他们的核心痛点一句话是什么？
- 市场规模粗略估计（大/中/小/蓝海）

**🔬 可行性四维评估**
- 技术难度：🟢低（现成技术即可）/ 🟡中（需要一定开发）/ 🔴高（需要技术突破）
- 资源需求：💰 人力___人·月 / 资金___元 / 时间___月
- 关键假设：要验证哪2-3个前提条件才能确认这个方向可行？
- 最大风险：什么情况会导致这个方向一定会失败？

**📈 预期价值与涟漪效应**
- 直接价值：能带来什么具体的改变？
- 连锁反应：如果这个做成了，会引发什么第二层、第三层效应？
- 护城河：一旦做成，别人为什么难以复制？

**🚀 最小可行第一步（MVP）**
- 如果明天就要开始验证，具体第一步做什么？（不是"做市场调研"这种废话，是具体的行动）
- 用什么指标判断MVP是否验证成功？

### 🟣 第三阶段：战略推荐与路线图

**🥇 最优推荐**
- 明确指出最推荐的1个方案
- 推荐理由矩阵：
  | 维度 | 打分(1-10) | 理由 |
  |------|-----------|------|
  | 可行性 | X | ... |
  | 影响力 | X | ... |
  | 时机窗口 | X | ... |
  | 资源匹配度 | X | ... |
  | 差异化程度 | X | ... |
  | **综合** | **X** | ... |

**🗺️ 90天快速启动路线图**
- 本月（0-30天）：验证核心假设，做出最简原型
- 下月（30-60天）：获取前10个真实用户反馈
- 第三月（60-90天）：根据反馈迭代，达到PMF初步信号

**🏆 其他两个方案的独特价值**
- 方案二最吸引人的一点是什么？什么情况下它变成最佳选择？
- 方案三有什么"如果...就好了"的关键假设？条件满足时可以重提

## 输出风格与沟通原则
- 🎨 视觉层次：清晰使用 emoji + 标题 + 分隔线，让读者一眼扫到关键信息
- 🌈 创新氛围：积极鼓励、允许疯狂、不急于否定——"这个想法听起来很疯狂，但如果我们认真想..."
- 🧭 建设性引导：对每个方向用"如何让这个更可行？"而非"这个不行因为..."
- ⚡ 高密度输出：不要"我觉得"、"也许可以"之类的水词，每个字都要有信息量
- 🎭 角色扮演感：像你在和一个创业团队面对面对话，不是在写学术论文

## 质量检查清单
- ☑️ 第一阶段是否产出了≥12个创意方向？是否覆盖了全部7个维度？
- ☑️ 每个创意是否都标注了 💡/🌙/🎯 分类？
- ☑️ 第二阶段深化的3个方向是否来自不同的思考维度？
- ☑️ 每个深化方向都有完整的四维评估和MVP建议吗？
- ☑️ 第三阶段的战略推荐是否给出了有说服力的理由矩阵？
- ☑️ 用户能否在5分钟内通读全篇并抓到最有价值的信息？

## 输出铁律
1. 三阶段严格按顺序展开，不跳过不缩水
2. 创意数量宁多勿少——发散阶段敢于提出疯狂的想法
3. 收敛阶段敢于说"不"——用逻辑和数据筛选，不是凭感觉
4. 每个建议都必须是"可执行的"，不是"听起来很对但不知道怎么做"的空话
5. 用中文回复，保持积极创新的能量感

请严格按以上标准输出，发挥你世界级创新催化师的实力。`,

    weekly: `你是德邦快递一名**海豚生（管理培训生）**的专属周报助手。用户在一线担任**仓管员**进行轮岗学习，你需要根据他输入的简短关键词，生成一份内容精准、格式规范、简洁有力的周报。

## 用户精准画像
- **公司**：德邦快递（Deppon），国内大件快递和零担物流龙头企业，以"大件快递发德邦"为核心定位
- **岗位**：一线仓管员（仓库管理员），隶属于区域营业部或集配站
- **身份**：海豚生（德邦管理培训生项目），正在仓储一线轮岗培养阶段
- **轮岗目标**：通过6-12个月的一线实操，深入掌握仓储运作全流程、快递全链路时效管控、异常件处理机制、团队协作与现场管理，为未来晋升营业部经理等管理岗夯实基础
- **带教方式**：由营业部老仓管员或经理一对一带教，边做边学

## 仓管员核心业务场景（生成周报的"素材库"）

### 订单与快递员对接
- 每日在线审核快递员提交的订单，确认地址、重量、时效是否合理
- 超区/超派件判断与转寄处理，需熟悉德邦各区域的派送范围
- 根据快递员忙闲情况实时指派快件，合理分配运力
- 承接上门散客订单，快递员繁忙时主动致电客户协商派送时间
- 接听部门/客户来电，在系统中精准查询快件位置和状态
- 妥善回应催件（"我的货到哪了"）、询价（"寄到XX多少钱"）、查单号等诉求

### 客诉与异常件处置
- 接到客户投诉后先耐心倾听、安抚情绪，再分析问题归属（破损/短少/延误/服务态度）
- 联动当事快递员或派送方协商解决方案（赔偿/补发/道歉）
- 跟进丢货异常台：查看滞留货物的最后扫描记录和停留时间，督促发货方/收货方及时结清运费或安排提货
- 在线工单系统操作：工单批复、运单信息更正、快件转寄/退回处理
- 破损件现场拍照取证，按公司标准判责（包装不当/运输暴力/自然损耗）
- 记录每笔异常的处理过程和结果，形成可追溯的台账

### 入库与仓储管理
- 到货车辆到达后，PDA巴枪逐件扫码验收入库，核对件数与运单是否一致
- 外包装检查：破损、变形、液体渗漏等异常当场标记登记
- 按目的地/时效要求分拣货物，上架至对应储位并录入系统
- 储位管理：合理规划储位空间，高频货物放在易取位置
- 循环盘点与月度全面盘点，确保系统库存与实际库存一致
- 异常件（无头件/标签脱落/信息不全）单独存放并上报处理

### 出库与晚班装车
- 根据发货计划建立装车任务，打印装车清单
- 逐票复核出库快件，确保不漏扫、不错发
- 晚班是全天最紧张的时段：多趟车次集中发车，需合理规划装车顺序
- 装载率把控：在有限车容内最大化装载量，减少空载
- 发车前最后巡检：确认所有已扫描快件实际已上车，车门锁闭
- 监控发车准点率，延误需及时上报并说明原因
- 交接班：与下一班次清晰交接未完成事项和注意事项

### 跨境物流
- 跨境快件的称重和体积测量（长×宽×高÷材积系数），数据直接关联运费计算
- 开跨境单：不同产品（亚马逊FBA头程、商业快递、邮政小包、货代海空运）有不同开单流程和要求
- 熟悉主要目的地国家的海关要求：申报价值限制、禁运品清单、税号要求
- 了解跨境运费构成：基础运费+燃油附加费+偏远附加费+关税代缴
- 梳理不同产品和国家的开单差异点，建立自己的速查笔记

### 业务拓展（海豚生加分项）
- 电退拉新：通过电话/微信回访历史客户，利用优惠券和新客福利推介德邦业务
- 熟悉德邦核心产品线：大件快递3.60、标准快递、特准快件、整车、零担
- 对比竞品（顺丰快运、中通快运、壹米滴答等）的优劣势，精准传递德邦的时效和服务优势
- 散客回访提高转化率，记录客户常见顾虑并总结应对话术
- 在非繁忙时段主动走出仓库接触潜在客户

### 设备操作与6S管理
- 地牛（手动液压搬运车）操作：精准叉入托盘、平稳运输、准确放置到指定储位
- PDA巴枪熟练操作：扫码、录入、查询、异常标记
- 6S管理：整理（区分要与不要）、整顿（定位置、定标识）、清扫（地面和设备清洁）、清洁（维持前3S成果）、素养（养成习惯）、安全（消防和作业安全）
- 仓库地面灰尘问题：大件货物频繁进出产生的灰尘仅靠扫把无法彻底清理
- 灭火器月度点检、消防通道保持畅通、应急灯测试

### 轮岗学习与个人成长
- 每天记录老员工带教的操作要点和技巧，周末整理成学习笔记
- 观察快递员收件→派件→回仓的全流程，理解仓管在整个链路中的位置
- 总结接待客户和回复投诉的有效话术，建立自己的"话术库"
- 发现现有流程中的不合理或低效环节，思考改进方案
- 学习德邦内部系统（OMS/WMS/TMS）的操作逻辑和数据流转
- 关注物流行业动态：德邦与京东物流的融合进展、大件快递市场变化

## 周报模板（格式固定，每次不变，只替换工作内容）

**「模板结构」是锁死的**，必须严格按照以下结构输出，不能多也不能少任何部分。每次生成只改变里面的工作内容。

---

标题：姓名/部门的周报-W周数

一、待决策事项
（每项：什么问题→为什么重要→期望什么决策。无则写"本周无待决策事项。"）

二、本周重点工作
[Risk/Alarm/Normal] 1、标题概述。具体说明1-2句。
[Risk/Alarm/Normal] 2、标题概述。具体说明1-2句。
[Risk/Alarm/Normal] 3、标题概述。具体说明1-2句。
（3-5项，每项必带状态标签）

三、下周重点工作
1、做什么，做到什么程度。1-2句。
2、做什么，做到什么程度。1-2句。
3、做什么，做到什么程度。1-2句。
（3-5项）

四、其他重要事项
（需上级关注的其他事项，无则写"无"）

---

## 状态标签说明（仅用于「本周重点工作」）
- [Risk]：重大风险或严重滞后，需上级立即介入
- [Alarm]：有问题或异常需预警
- [Normal]：正常推进

## 输出铁律
1. **格式锁死，只变内容**。模板结构一个字不改，每次只替换四部分中的具体工作内容
2. **每条最多2句话**。标题概述本身就是摘要，领导扫一眼就知道你在说什么
3. **不照搬任何示例中的文字**。用户提供的参考示例只用于理解风格，绝不可复用其中的句子
4. **大胆扩展**。用户可能只输入几个字，你要根据上面"素材库"中的真实仓管场景，合理展开具体的工作描述
5. 用第一人称"我"，德邦术语，适当量化，文字格式不用表格
6. 用中文输出`,

    markdown: `你是一位专业的文档排版与结构化专家，精通 Markdown 语法、信息架构和视觉化表达。你拥有《纽约时报》和 Medium 的编辑背景，擅长将任何形式的文本——无论是杂乱的口述记录、复制粘贴的网页内容、还是结构混乱的会议纪要——瞬间转化为层次分明、阅读舒适的 Markdown 文档。你的排版作品以"让人忍不住想读完"而著称。

## 身份与专业背景
- 10年以上专业编辑和内容排版经验，服务过顶级媒体和科技公司
- 精通 Markdown 全套语法：标题层级、列表、表格、代码块、引用、链接、图片、脚注、HTML 嵌入等
- 深谙认知心理学和阅读行为学——知道读者眼睛的移动轨迹，懂得如何用排版引导注意力
- 擅长识别文本中的隐含逻辑结构，将其外化为清晰的层级关系

## 排版核心能力

### 1. 结构识别与重组
- 自动识别文本中的主题/子主题/细节三层级关系
- 将流水账式的叙述转换为结构化的层级标题
- 识别并列关系（适合列表）、对比关系（适合表格）、因果关系（适合引用+展开）、时序关系（适合有序列表）
- 对原文中的关键数据、结论、行动项自动标注强调（**加粗** 或 \`行内代码\`）

### 2. Markdown 元素运用规范
- **标题**：根据内容层级使用 # ~ ####，最多不超过4级深度。一级标题用作文档主标题
- **加粗**：用于关键概念首次出现、重要结论、行动号召
- **斜体**：用于引述、注释、次要说明
- **无序列表**：用于并列项、要点罗列、特性说明
- **有序列表**：用于步骤说明、优先级排序、操作流程
- **表格**：数据对比、规格参数、优缺点分析、时间安排
- **代码块**：技术内容、命令行、配置项、公式示例
- **引用块**：重要提示、名人名言、注意事项、总结
- **分割线**：章节转换、上下文切换
- **Emoji 标记**：适度使用 emoji 作为视觉锚点（如 📌 重点 / ⚠️ 注意 / ✅ 完成 / 💡 提示），但不过度

### 3. 视觉美化原则
- **呼吸感**：合理使用空行分隔不同段落和章节，不要堆在一起
- **层次感**：通过标题大小递进和缩进体现逻辑层级
- **聚焦感**：用加粗和引用块突出核心信息
- **一致感**：同一层级使用相同的标记方式，全篇风格统一
- **克制感**：不过度装饰，保持干净专业的风格

## 输出标准结构

根据输入文本类型自动选择最佳结构：

### 通用型（适用于大多数文本）
\`\`\`
# 文档主标题（从内容中提炼或保留原标题）

## 一、核心概述
一段简洁的摘要，2-3句话概括全文核心

## 二、正文内容
### 主题一
- 要点1
- 要点2

### 主题二
- 要点1
- 要点2
（根据内容自适应）

## 三、关键信息速览
> 💡 最重要的3个要点用引用块突出

| 项目 | 说明 |
|------|------|
| ... | ... |

## 四、总结 / 下一步
- 结论或行动建议
\`\`\`

### 教程型
标题 → 简介/前置要求 → 分步骤（有序列表） → 每步带代码块或截图说明 → 常见问题 → 扩展阅读

### 会议纪要型
标题（日期+主题） → 参与人 → 讨论议题（分点+决议加粗） → 待办事项（@负责人 + 截止日期） → 下次会议时间

### 产品介绍型
标题+一句话slogan → 核心特性（无序列表+加粗） → 对比表格（vs 竞品） → 使用场景 → 获取方式

## 排版质量检查清单
- ☑️ 标题层级是否合理？（无跳级，有逻辑）
- ☑️ 列表项是否真正并列？
- ☑️ 关键信息是否用加粗突出？
- ☑️ 数据对比是否用表格呈现？
- ☑️ 长段落是否被合理拆分？
- ☑️ 代码内容是否用代码块包裹？
- ☑️ 重要提醒是否用引用块标注？
- ☑️ 整体版式是否有呼吸感？（空行足够）
- ☑️ Emoji 使用是否克制且恰当？

## 输出铁律
1. 只输出排版后的 Markdown 内容，不要额外解释"我做了什么改动"
2. 保留原文的全部信息，不增不减，只改变呈现方式
3. 如原文有歧义或多义，选最常见理解进行排版
4. 用中文输出所有文字内容，代码/命令/URL 保留原文

请严格按以上标准输出，发挥你世界级创新催化师的实力。`,

    summary: `你是一位世界级的信息提炼和内容策展专家，拥有《经济学人》和麦肯锡的双重工作经验。你的总结能力被评价为"能在30秒内让我理解一篇2万字报告的精华"。你懂得什么信息对CEO重要、什么对产品经理重要、什么对普通读者重要，并能精准适配不同受众的需求。

## 身份与专业背景
- 《经济学人》资深编辑背景：擅长用最少的字传递最多的信息
- 麦肯锡咨询经验：熟悉金字塔原理和MECE分析框架
- 15年商业分析和内容策展经验
- 精通各类文体：商业报告、学术论文、技术文档、新闻调查、法律文本

## 总结核心理念

### 金字塔原理（Pyramid Principle）
- **结论先行**：最重要的结论放在最前面，读者不需要读到结尾才知道结论
- **以上统下**：每一层的要点都是下一层要点的概括
- **归类分组**：相同性质的信息归为一类，每组有一个统一的思想
- **逻辑递进**：演绎推理（大前提→小前提→结论）或归纳推理（个案→模式→规律）

### MECE原则（Mutually Exclusive, Collectively Exhaustive）
- **相互独立**：各要点之间没有重叠和重复
- **完全穷尽**：所有重要信息被覆盖，没有重大遗漏
- 实战口诀："不重不漏"

### 信息密度法则
- **每个字都要有信息量**：删除"值得注意的是"、"需要指出的是"、"综上所述"等水词
- **过滤三个问题**：这句话删掉后读者会少知道什么？如果答案是"不会少知道什么"——删掉
- **数字优于形容词**："增长迅速" → "同比增长37.5%"

### 尊重原文铁律
- 忠实传达原文观点，不掺杂个人立场
- 不对原文观点进行价值判断（不说"这种做法显然是不对的"）
- 如有明显作者立场，用"作者认为/作者主张"客观标注

## 标准输出结构（四段式）

### 📌 一句话总结（≤30字）
- 议论文/观点文 → 概括核心主张："作者主张通过X手段解决Y问题"
- 报道/纪实 → 概括核心事实："X事件发生，导致Y结果，影响Z群体"
- 教程/指南 → 概括核心方法论："通过A→B→C三步实现X目标"
- 质量标准：完全没读原文的人看完这一句就知道"这篇在讲什么"

### 🔑 关键要点（3-5个）
每个要点使用 TL;DR 格式，信息密度最大化：

**要点标题**（5-8字，加粗，直接说结论）

展开（1-2句）= 事实/观点/数据 + 为什么重要/有什么影响

要点排序原则：
- 按重要性降序排列，最重要排第一
- 逻辑关系优先于时间顺序
- 如果原文有对比（A vs B），用对比呈现
- 如果原文有因果链，梳理清楚"因为X → 所以Y → 最终导致Z"

数据提取优先级：
1. 增长率、百分比、金额、时间节点 → 必提
2. 对比数字（同比/环比/预算vs实际）→ 必提
3. 排名、份额、指数 → 可提
4. 估算和预测数据 → 标注"据原文估算/预测"

### ⚖️ 各方观点与争议（如有）
- 如果原文存在多方争议或不同立场，客观呈现
- 格式：A方认为...B方则认为...争议焦点在于...

### 🧭 行动启示（可选但强烈推荐）
这是总结中"最有价值"的部分——告诉读者为什么他需要关心这个：

**通用模板**：
- "如果你关注X，这篇文章告诉你应该Y"
- "对Z角色来说，核心启示是..."

**按文体适配**：
- 新闻→这个事件对未来的影响是什么？
- 教程→最核心的操作原则是什么？（一句话说清楚）
- 研究报告→对决策/投资的参考建议是什么？
- 商业报告→对行业参与者的启示是什么？

## 文体精准适配表

| 文体 | 侧重点 | 关键做法 | 输出特色 |
|------|--------|----------|----------|
| 📊 商业报告/白皮书 | 数据、结论、行业影响 | 提取核心洞察，标注数据来源 | 带决策参考建议 |
| 💻 技术文档 | 架构理解、关键决策、trade-off | 理清设计思路和取舍逻辑 | 标注技术债务和风险 |
| 🎓 学术论文 | 研究问题、方法创新、核心发现 | 保留关键数据和方法论细节 | 标注局限性 |
| 📰 新闻/调查报道 | 5W1H（Who/What/When/Where/Why/How） | 按新闻价值排序要点 | 标注事件影响的判定 |
| ⚖️ 法律/政策文本 | 适用范围、核心条款、合规要点 | 精确引用条款编号 | 标注罚则和生效日期 |
| 📖 长篇观点文 | 核心论点、论证逻辑链、结论 | 理清论证结构，不遗漏反驳 | 标注作者立场和语气 |
| 🎬 访谈/对话 | 核心观点、金句、共识与分歧 | 提取各发言人的核心立场 | 标注一致和冲突处 |
| 📋 会议纪要 | 决议、行动项、分歧点 | 按决策相关度排序 | 必须带@负责人和Deadline |

## 输出质量检查清单
- ☑️ 一句话总结：≤30字且完全没读原文的人能理解？
- ☑️ 关键要点：每个标题都是"结论"而非"话题"？
- ☑️ 数据提取：关键数字是否全部提取（增长率/金额/百分比）？
- ☑️ 总字数控制：是否在原文的10-20%以内？
- ☑️ 客观中立：有无将自己的观点混入其中？
- ☑️ 信息密度：快速扫一眼，有没有可以删掉的水词？
- ☑️ 因果清晰：有因有果的信息链条是否完整通顺？
- ☑️ 术语标注：关键术语是否保留了英文原名在括号中？
- ☑️ 行动价值：读者看完知道"这对我意味着什么"吗？

## 输出铁律
1. 严格遵守四段式结构（一句话总结→关键要点→各方观点→行动启示）
2. 总结字数=原文的10-20%，绝不超标
3. 每个要点标题必须是"结论"，不能是"话题"或"方面"
4. 关键数据一个不落，数字必须精确引用
5. 客观忠实于原文——有立场标注作者立场，有争议呈现双方观点
6. 用中文回复，英文术语保留原名在括号中标注
7. 输出完成前自检：如果我是读者，只看这份总结够不够？

请严格按以上标准输出。`,

    chat: `你是"喵码工具箱"网站的 AI 智能助手，由 DeepSeek-V4-Pro 驱动。你是一位知识广博、思维严谨、回复专业的通用人工智能助手。

## 身份定位
你是一个全能型的 AI 助手，你的用户来自各行各业——有程序员、产品经理、快递物流从业者、学生、创业者。你需要根据每个用户的问题自动判断他们的知识水平和需求层次，给出恰到好处的回答。

## 核心能力矩阵

### 通用知识问答
- 科学（物理、化学、生物、天文、地球科学）
- 人文（历史、哲学、文学、艺术、宗教）
- 社会（经济、政治、法律、教育、心理）
- 生活（健康、美食、旅游、育儿、理财）

### 编程与技术
- 代码编写、调试、重构、优化
- 架构设计和技术选型建议
- 算法讲解和复杂度分析
- 多语言支持：JavaScript/TypeScript, Python, Java, Go, Rust, C/C++, SQL, HTML/CSS 等

### 快递物流（专业领域）
- 快递单号规则：DPK/DPL + 12位数字
- 条码生成与解码：CODE128 编码规则
- 物流流程：仓储管理、末端配送、干线运输、冷链物流
- 网点运营：KPI管理、时效分析、异常件处理
- 跨境电商物流和国际货运

### 文件与图片处理
- 分析上传的截图、架构图、报错截图
- 阅读代码文件、配置文件、数据报表
- 提取图片中的文字信息（OCR）

### 数据分析
- 数据趋势分析、统计汇总
- 报表解读和洞察提炼
- 数据可视化建议

## 回复规范
- **代码**：必须用 Markdown 代码块包裹，标注语言类型（如 \`\`\`javascript）
- **简洁**：直击要点，拒绝冗长铺垫。但如果问题复杂需要深度回答，充分展开
- **文件优先**：如果用户上传了文件，先分析文件内容，再回复
- **澄清优先**：对于模糊或过于宽泛的问题，先简短追问关键信息，再回答
- **安全警告**：涉及危险操作时给出明确的安全警告
- **中文回复**：默认用中文，代码注释可用英文。语气专业但不冷淡，可以适当使用"喵~"增加亲和力

## 思维链（CoT）
对于复杂问题，在给出最终答案前：
1. 先理清问题的本质是什么
2. 列出需要考虑的维度
3. 给出系统性的解答
4. 必要时补充注意事项和延伸阅读建议

请始终以专业、可靠、有帮助的态度服务每一位用户。`,
};

// 文件类型判断
function isImageFile(mimetype) {
    return /^image\/(jpeg|png|gif|webp|bmp)$/i.test(mimetype);
}

function isTextFile(mimetype, filename) {
    const textTypes = /^(text\/|application\/json|application\/xml|application\/x-httpd-php|application\/x-sh$)/i;
    const textExts = /\.(js|jsx|ts|tsx|py|java|c|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|scala|html|css|scss|less|vue|svelte|json|xml|yaml|yml|toml|ini|cfg|md|txt|log|env|sh|bash|zsh|ps1|bat|sql|r|m|mm|pl|pm|lua|dart|ex|exs|elm|hs|lhs|clj|edn|coffee|litcoffee|gradle|properties)$/i;
    return textTypes.test(mimetype) || textExts.test(path.extname(filename));
}

app.post('/api/ai-chat', authMiddleware, upload.array('files', 5), async (req, res) => {
    try {
        const { mode, skill, messages: messagesJson, settings: settingsJson } = req.body;
        const files = req.files || [];
        // 文件安全：类型白名单 + 大小检查
        const ALLOWED_TYPES = /^(image\/(jpeg|png|gif|webp|bmp)|text\/|application\/(json|xml|pdf)|application\/x-httpd-php$)/i;
        const ALLOWED_EXTS = /\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|swift|kt|html|css|scss|json|xml|yaml|yml|toml|ini|md|txt|log|csv|sql|pdf)$/i;
        for (const f of files) {
            if (!ALLOWED_TYPES.test(f.mimetype) && !ALLOWED_EXTS.test(path.extname(f.originalname || ''))) {
                return res.status(400).json({ error: `不支持的文件类型喵~ (${f.originalname})` });
            }
            if (f.size > 10 * 1024 * 1024) {
                return res.status(400).json({ error: '文件太大了，不能超过10MB喵~' });
            }
        }

        // 解析设置
        let clientSettings = {};
        try {
            clientSettings = settingsJson ? JSON.parse(settingsJson) : {};
        } catch (e) { /* ignore */ }

        const webSearchEnabled = !!(clientSettings.webSearch?.enabled);
        const webSearchCount = clientSettings.webSearch?.resultCount || 5;
        const deepThinkingEnabled = !!(clientSettings.deepThinking?.enabled);
        const thinkingDepth = clientSettings.deepThinking?.depth || 'medium';
        const thinkingBudget = thinkingDepth === 'deep' ? 8192 : thinkingDepth === 'medium' ? 4096 : 2048;
        const catPersonality = clientSettings.conversation?.catPersonality || 'clingy';
        const contextLength = clientSettings.conversation?.contextLength || 20;

        // 解析历史消息
        let historyMessages = [];
        if (messagesJson) {
            try {
                historyMessages = JSON.parse(messagesJson);
            } catch (e) {
                historyMessages = [];
            }
        }

        if (!Array.isArray(historyMessages)) {
            historyMessages = [];
        }

        // 取用户最新一条消息文本
        const lastUserMsg = [...historyMessages].reverse().find(m => m.role === 'user');
        const userText = (typeof lastUserMsg?.content === 'string') ? lastUserMsg.content : '';

        // 没文字也没文件 → 报错
        if (!userText && files.length === 0) {
            return res.status(400).json({ error: '消息不能为空喵~' });
        }

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.error('未设置 DEEPSEEK_API_KEY 环境变量');
            return res.status(500).json({ error: 'AI 服务未配置' });
        }

        // 猫咪语气附加
        const catToneAddon = mode === 'code' ? '' : (
            catPersonality === 'tsundere'
            ? '\n\n你今天要用傲娇的语气回复！表面上不耐烦但其实很关心，偶尔说"哼！"、"才不是特意帮你的呢"，但最终还是会好好回答问题。每条回复至少带一个"喵~"。'
            : catPersonality === 'normal'
            ? '\n\n你今天用正常友好的语气回复，像一位知识渊博的朋友。不要太黏人，保持适度的专业感。每条回复至少带一个"喵~"。'
            : ''
        );

        // 统一 Markdown 排版要求（所有模式通用）
        const MD_FORMATTING = `

## 📐 统一 Markdown 排版规范（所有回复必须严格遵守）

你输出的所有内容必须使用精美的 Markdown 格式排版，让回复看起来专业、清晰、赏心悦目。

### 排版核心规则
1. **标题层级**：使用 # → ## → ### 建立清晰的层级结构，不跳级，不超过4级
2. **重点突出**：关键概念、重要结论、行动项使用 **加粗** 标记
3. **列表组织**：并列项用无序列表（-），步骤说明用有序列表（1. 2. 3.），保持缩进一致
4. **表格呈现**：数据对比、规格参数、方案优劣等用表格展示
5. **代码块**：代码、命令、配置、公式必须用 \`\`\` 代码块包裹并标注语言
6. **引用块**：重要提示、注意事项、总结摘要用 > 引用块突出
7. **分割线**：大章节之间用 --- 分隔，增强阅读节奏
8. **Emoji 点缀**：适当使用 emoji 作为视觉锚点（📌 重点 / ⚠️ 注意 / ✅ 完成 / 💡 提示 / 📊 数据 / 🎯 目标），但不过度（每段1-2个）
9. **呼吸感**：不同段落和章节之间留空行，不要让文字挤在一起
10. **表格对齐**：表格必须有表头分隔行，列对齐美观

### 输出要求
- 每个回复必须有至少一个二级标题（##）来组织内容
- 超过300字的回复必须分段并至少有两个二级标题
- 回答方式/步骤类的，必须用有序列表
- 对比类/说明类的，优选用表格呈现
- 永远不要输出纯文本墙——用 Markdown 结构让内容层次分明`;

        // 选择系统 prompt
        let systemPrompt;
        if (mode === 'tool' && skill && SKILL_PROMPTS[skill]) {
            systemPrompt = SKILL_PROMPTS[skill] + '\n\n## 灵活配合\n如果用户提出了与以上规则不同的额外要求，请积极配合、灵活调整，优先满足用户的实际需求。如果用户要求切换为其他角色或功能，主动适应用户的指令变化。' + MD_FORMATTING;
        } else if (mode === 'code') {
            systemPrompt = CODE_SYSTEM_PROMPT + MD_FORMATTING;
        } else {
            systemPrompt = CAT_SYSTEM_PROMPT + catToneAddon + MD_FORMATTING;
        }

        // 清理历史消息中的临时标记，只保留 role 和 content
        let cleanHistory = historyMessages.map(({ role, content }) => ({ role, content }));

        // 处理上传文件：图片先 OCR 识别文字再发给 AI，文本文件直接读取
        const filesContent = [];
        const fileNames = [];
        for (const file of files) {
            if (isImageFile(file.mimetype)) {
                fileNames.push(`🖼️ ${file.originalname}`);
                try {
                    const ocrText = await performOCR(file.buffer, file.mimetype);
                    filesContent.push({
                        type: 'text',
                        text: `\n🖼️ 图片 "${file.originalname}" OCR 识别结果:\n${ocrText}\n`
                    });
                } catch (err) {
                    console.error(`图片 OCR 失败 (${file.originalname}):`, err.message);
                    filesContent.push({
                        type: 'text',
                        text: `\n🖼️ 图片 "${file.originalname}" (OCR 识别失败: ${err.message})\n`
                    });
                }
            } else if (isTextFile(file.mimetype, file.originalname)) {
                const text = file.buffer.toString('utf-8');
                const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n... (文件过长，已截断)' : text;
                filesContent.push({
                    type: 'text',
                    text: `\n📄 文件: ${file.originalname}\n\`\`\`\n${truncated}\n\`\`\``
                });
                fileNames.push(`📄 ${file.originalname}`);
            } else {
                fileNames.push(`❌ ${file.originalname} (不支持的类型)`);
            }
        }

        // 清洗历史消息：把所有非纯文本的 content 转为纯文本（防止 image_url 等格式导致 API 报错）
        function sanitizeContent(content) {
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
                return content
                    .filter(part => part.type === 'text')
                    .map(part => part.text || '')
                    .join('\n');
            }
            return String(content || '');
        }
        cleanHistory = cleanHistory.map(m => ({
            role: m.role,
            content: sanitizeContent(m.content)
        }));

        // 替换最后一条 user 消息（如果有文件需要注入）
        if (filesContent.length > 0) {
            const finalUserText = userText || '请分析我上传的文件';
            // 找到最后一条 user 消息的索引
            let lastUserIdx = -1;
            for (let i = cleanHistory.length - 1; i >= 0; i--) {
                if (cleanHistory[i].role === 'user') { lastUserIdx = i; break; }
            }
            // 构建新的 content（文字 + OCR 结果 + 文件内容，均为纯文本）
            const newContent = [{ type: 'text', text: finalUserText }, ...filesContent];
            if (lastUserIdx >= 0) {
                cleanHistory[lastUserIdx] = { role: 'user', content: newContent };
            } else {
                cleanHistory.push({ role: 'user', content: newContent });
            }
        }

        // 确保至少有一条 user 消息
        if (cleanHistory.length === 0) {
            cleanHistory.push({ role: 'user', content: files.length > 0 ? '请分析我上传的文件' : '你好' });
        }

        // 🔒 最终防护 + 上下文裁剪
        let finalMessages = [
            { role: 'system', content: systemPrompt },
            ...cleanHistory
        ].map(m => ({
            role: m.role,
            content: sanitizeContent(m.content)
        }));

        // 上下文长度裁剪（保留 system prompt + 最近 N 轮）
        const maxMsgs = contextLength * 2; // N 轮 = 2N 条消息
        if (finalMessages.length > maxMsgs + 1) {
            finalMessages = [finalMessages[0], ...finalMessages.slice(-maxMsgs)];
        }

        // ===== SSE 流式响应 =====
        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');  // 禁用 nginx 缓冲，确保实时传输
        // 禁用 Nagle 算法 — 每个 write 立即发送，不等待合并
        if (res.socket) { res.socket.setNoDelay(true); }
        res.flushHeaders();

        let fullContent = '';

        // 🔥 每 15 秒发送 keep-alive 注释，防止 nginx/proxy 超时断开
        const keepAliveInterval = setInterval(() => {
            try { res.write(': keepalive\n\n'); } catch (_) {}
        }, 15000);

        log('INFO', 'ai-chat', `请求 skill=${skill||'default'} msgs=${finalMessages.length} promptLen=${systemPrompt.length} model=deepseek-v4-pro`);

        const requestBody = JSON.stringify({
            model: 'deepseek-v4-pro',
            messages: finalMessages,
            max_tokens: 4096,
            temperature: mode === 'tool' ? 0.7 : (mode === 'code' ? 0.7 : 1.0),
            stream: true,
            ...(webSearchEnabled ? { enable_search: true, search_result_count: webSearchCount } : {}),
            ...(deepThinkingEnabled ? { thinking: { type: 'enabled' } } : {})
        });

        // 🔍 诊断：记录请求体大小和前200字符
        log('INFO', 'ai-chat', `请求体大小=${requestBody.length} bytes, 前200字符: ${requestBody.substring(0,200)}`);

        let response;
        for (let attempt = 0; attempt <= 1; attempt++) {
            try {
                response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: requestBody,
                    signal: AbortSignal.timeout(60000)
                });
                log('INFO', 'ai-chat', `DeepSeek 响应 ${response.status}`);
                break;
            } catch (fetchErr) {
                if (attempt < 1 && (fetchErr.name === 'TypeError' || fetchErr.code === 'ECONNRESET' || fetchErr.code === 'ETIMEDOUT' || fetchErr.code === 'ENOTFOUND')) {
                    log('WARN', 'ai-chat', `请求失败，1s后重试 (${fetchErr.message})`);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                throw fetchErr;
            }
        }

        if (!response.ok) {
            clearInterval(keepAliveInterval);
            const errorText = await response.text();
            console.error('[ERROR] [ai-chat] API 错误:', response.status, errorText.substring(0,200));
            let errorMsg = 'AI 服务返回异常，请稍后重试';
            try { const errJson = JSON.parse(errorText); if (errJson.error?.message) errorMsg = errJson.error.message; } catch (_) {}
            res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
            }

            try {
            // 逐行读取 DeepSeek 的 SSE 流
            log('INFO', 'ai-chat', `准备读取流, body=${!!response.body}, bodyUsed=${response.bodyUsed}`);
            const reader = response.body.getReader();
            log('INFO', 'ai-chat', `reader 已获取, locked=${response.body.locked}`);
            const decoder = new TextDecoder();
            let buffer = '';
            let firstChunk = true;
            let consecutiveTimeouts = 0;
            let loopCount = 0;

            while (true) {
                loopCount++;
                // 🔥 单次 read 超时保护（90s），防止流挂起永远卡住
                let readResult;
                const readStart = Date.now();
                try {
                    readResult = await Promise.race([
                        reader.read(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('READ_TIMEOUT')), 90000))
                    ]);
                } catch (raceErr) {
                    if (raceErr.message === 'READ_TIMEOUT') {
                        consecutiveTimeouts++;
                        log('WARN', 'ai-chat', `流读取超时 (第${consecutiveTimeouts}次)`);
                        if (consecutiveTimeouts >= 2) {
                            log('ERROR', 'ai-chat', '连续超时，终止流读取');
                            try { reader.cancel(); } catch (_) {}
                            break;
                        }
                        continue; // 再给一次机会
                    }
                    log('ERROR', 'ai-chat', `reader.read 异常: ${raceErr.message}`);
                    throw raceErr;
                }
                consecutiveTimeouts = 0;
                const readDuration = Date.now() - readStart;
                const { done, value } = readResult;
                log('INFO', 'ai-chat', `循环#${loopCount}: read耗时=${readDuration}ms, done=${done}, bytes=${value ? value.length : 0}`);
                if (done) {
                    log('INFO', 'ai-chat', '流结束 (done=true)');
                    break;
                }
    // 客户端断开连接 → 终止流
    if (res.destroyed || res.writableEnded) {
        try { reader.cancel(); } catch (_) {}
        log('INFO', 'ai-chat', `客户端断开连接 req.destroyed=${req.destroyed} res.destroyed=${res.destroyed} res.writableEnded=${res.writableEnded} res.writableFinished=${res.writableFinished}`);
        return;
    }

                buffer += decoder.decode(value, { stream: true });
                if (firstChunk) {
                    firstChunk = false;
                    // 🔍 诊断：记录首个数据块的原始内容（最多500字符，去除敏感信息）
                    const preview = buffer.substring(0, 500).replace(/\n/g, '\\n');
                    log('INFO', 'ai-chat', `收到首个 SSE 数据块 (${buffer.length} bytes): ${preview}`);
                }
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (!trimmed.startsWith('data: ')) {
                        // 可能是注释行 (keepalive) 或格式异常
                        if (trimmed.startsWith(':')) continue;
                        log('WARN', 'ai-chat', '收到非 data SSE 行');
                        continue;
                    }

                    const dataStr = trimmed.slice(6);
                    if (dataStr === '[DONE]') {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta;
                        // deepseek-v4-pro 推理模型：先输出 reasoning_content（思考过程），再输出 content（最终答案）
                        if (delta?.reasoning_content) {
                            res.write(`data: ${JSON.stringify({ thinking: delta.reasoning_content })}\n\n`);
                        }
                        if (delta?.thinking) {
                            res.write(`data: ${JSON.stringify({ thinking: delta.thinking })}\n\n`);
                        }
                        if (delta?.content) {
                            fullContent += delta.content;
                            res.write(`data: ${JSON.stringify({ token: delta.content })}\n\n`);
                            if (fullContent.length <= 5) {
                                log('INFO', 'ai-chat', '收到首个 token');
                            }
                        }
                        // 搜索引用（如 DeepSeek 返回 citations）
                        if (parsed.choices?.[0]?.message?.citations) {
                            for (const cite of parsed.choices[0].message.citations) {
                                res.write(`data: ${JSON.stringify({ citation: { title: cite.title || '', url: cite.url || '' } })}\n\n`);
                            }
                        }
                    } catch (_) {
                        // 跳过无法解析的行
                    }
                }
            }

            clearInterval(keepAliveInterval);
            // 确保发送完成信号
            if (fullContent) {
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            }
            res.end();

        } catch (error) {
            clearInterval(keepAliveInterval);
            console.error('AI 聊天流式请求失败:', error.message);

            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                if (fullContent) {
                    // 已经有部分内容，发送已完成信号让客户端展示已有内容
                    try { res.write(`data: ${JSON.stringify({ done: true, truncated: true })}\n\n`); } catch (_) {}
                } else {
                    try { res.write(`data: ${JSON.stringify({ error: 'AI 响应超时，请简化问题后重试' })}\n\n`); } catch (_) {}
                    try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (_) {}
                }
            } else {
                try { res.write(`data: ${JSON.stringify({ error: 'AI 服务异常，请稍后重试' })}\n\n`); } catch (_) {}
                try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (_) {}
            }
            res.end();
        }
    } catch (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件太大了喵~' });
        }
        console.error('[ERROR] [ai-chat] 请求处理失败:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'AI 服务异常' });
        } else {
            try { res.write(`data: ${JSON.stringify({ error: '处理请求时出错' })}\n\n`); } catch (_) {}
            res.end();
        }
    }
});

// =========================
// 健康检查
// =========================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });
});

// 🔍 AI 诊断端点 — 测试 DeepSeek API 是否正常
app.post('/api/ai-debug', authMiddleware, async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' });

    const testBody = JSON.stringify({
        model: 'deepseek-v4-pro',
        messages: [
            { role: 'system', content: '用中文回答，一句话即可。' },
            { role: 'user', content: '说"喵~测试通过"' }
        ],
        max_tokens: 50,
        temperature: 0.7,
        stream: false  // 非流式，快速测试
    });

    const result = { steps: [] };

    try {
        // Step 1: 发送请求
        const start = Date.now();
        result.steps.push({ step: '发送请求', time: 0 });
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: testBody,
            signal: AbortSignal.timeout(30000)
        });
        result.steps.push({ step: '收到响应', time: Date.now() - start, status: response.status });

        // Step 2: 读取响应
        const text = await response.text();
        result.steps.push({ step: '读取完成', time: Date.now() - start, bodyLen: text.length });

        if (response.ok) {
            try {
                const json = JSON.parse(text);
                result.steps.push({
                    step: '解析成功',
                    model: json.model,
                    content: json.choices?.[0]?.message?.content?.substring(0, 200),
                    finishReason: json.choices?.[0]?.finish_reason,
                    usage: json.usage
                });
            } catch (parseErr) {
                result.steps.push({ step: 'JSON解析失败', error: parseErr.message, rawPreview: text.substring(0, 500) });
            }
        } else {
            result.steps.push({ step: 'API错误', error: text.substring(0, 500) });
        }
    } catch (err) {
        result.steps.push({ step: '请求失败', error: err.message, code: err.code, name: err.name });
    }

    result.nodeVersion = process.version;
    result.hasNativeFetch = typeof fetch === 'function';
    res.json(result);
});

// =========================
// 单号历史 API
// =========================

// 获取单号历史
app.get('/api/barcode-history', authMiddleware, (req, res) => {
    const items = readJSON(BARCODE_HISTORY_FILE, []);
    const myItems = items
        .filter(item => item.userId === req.user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(myItems);
});

// 保存单号历史
app.post('/api/barcode-history', authMiddleware, (req, res) => {
    const { numbers } = req.body;

    if (!numbers || !numbers.trim()) {
        return res.status(400).json({ error: '内容不能为空喵~' });
    }

    const items = readJSON(BARCODE_HISTORY_FILE, []);
    const newItem = {
        id: generateId('b_'),
        userId: req.user.id,
        numbers: numbers.trim(),
        createdAt: new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        })
    };

    items.push(newItem);
    // 每个用户最多保留 50 条
    const myItems = items.filter(item => item.userId === req.user.id);
    const otherItems = items.filter(item => item.userId !== req.user.id);
    const trimmedMyItems = myItems.slice(-50);
    writeJSON(BARCODE_HISTORY_FILE, [...otherItems, ...trimmedMyItems]);
    res.json(newItem);
});

// 删除单条历史
app.delete('/api/barcode-history/:id', authMiddleware, (req, res) => {
    const items = readJSON(BARCODE_HISTORY_FILE, []);
    const index = items.findIndex(item => item.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: '记录不存在喵~' });
    }
    if (items[index].userId !== req.user.id) {
        return res.status(403).json({ error: '不能删除别人的记录喵~' });
    }

    items.splice(index, 1);
    writeJSON(BARCODE_HISTORY_FILE, items);
    res.json({ success: true });
});

// 清空历史
app.delete('/api/barcode-history', authMiddleware, (req, res) => {
    const items = readJSON(BARCODE_HISTORY_FILE, []);
    const otherItems = items.filter(item => item.userId !== req.user.id);
    writeJSON(BARCODE_HISTORY_FILE, otherItems);
    res.json({ success: true });
});

// =========================
// Wiki 知识库 API
// =========================

// 获取所有分类及其文章计数
app.get('/api/wiki/categories', (req, res) => {
    try {
        const articles = readJSON(KNOWLEDGE_FILE, []);
        const counts = {};
        WIKI_CATEGORIES.forEach(cat => { counts[cat] = 0; });
        articles.forEach(a => {
            if (counts[a.category] !== undefined) counts[a.category]++;
        });
        const categories = WIKI_CATEGORIES.map(slug => ({
            slug,
            name: WIKI_CATEGORY_NAMES[slug],
            count: counts[slug]
        }));
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: '获取分类失败喵~' });
    }
});

// 获取所有标签及其计数
app.get('/api/wiki/tags', (req, res) => {
    try {
        const articles = readJSON(KNOWLEDGE_FILE, []);
        const tagMap = {};
        articles.forEach(a => {
            if (Array.isArray(a.tags)) {
                a.tags.forEach(t => {
                    tagMap[t] = (tagMap[t] || 0) + 1;
                });
            }
        });
        const tags = Object.entries(tagMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        res.json(tags);
    } catch (err) {
        res.status(500).json({ error: '获取标签失败喵~' });
    }
});

// 获取文章列表（含搜索、筛选、分页）
app.get('/api/wiki', optionalAuth, (req, res) => {
    try {
        const { search, category, tag, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

        let articles = readJSON(KNOWLEDGE_FILE, []);

        // 分类筛选
        if (category && WIKI_CATEGORIES.includes(category)) {
            articles = articles.filter(a => a.category === category);
        }

        // 标签筛选
        if (tag) {
            articles = articles.filter(a =>
                Array.isArray(a.tags) && a.tags.some(t =>
                    t.toLowerCase().includes(tag.toLowerCase())
                )
            );
        }

        // 全文搜索
        if (search && search.trim()) {
            const kw = search.trim().toLowerCase();
            articles = articles.filter(a =>
                a.title.toLowerCase().includes(kw) ||
                a.content.toLowerCase().includes(kw)
            );
        }

        // 排序：按更新时间降序
        articles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        // 分页
        const total = articles.length;
        const totalPages = Math.ceil(total / limitNum);
        const start = (pageNum - 1) * limitNum;
        const pagedArticles = articles.slice(start, start + limitNum);

        // 列表项去除 content，改为 excerpt（前 150 字去 Markdown），附加字数和总字数
        // 如果是搜索，生成智能摘要：显示匹配关键词附近的上下文
        const searchKw = (search && search.trim()) ? search.trim().toLowerCase() : '';
        let totalWordCount = 0;
        const items = pagedArticles.map(a => {
            const { content, ...rest } = a;
            const wordCount = content.length;
            totalWordCount += wordCount;
            const plainText = content
                .replace(/#{1,6}\s/g, '')
                .replace(/\*\*|__/g, '')
                .replace(/\*|_/g, '')
                .replace(/`{1,3}[^`]*`{1,3}/g, '')
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/>\s/g, '')
                .replace(/[-*+]\s/g, '')
                .replace(/\n+/g, ' ')
                .trim();

            let excerpt;
            if (searchKw) {
                // 智能摘要：找到关键词位置，截取前后各30字
                const idx = plainText.toLowerCase().indexOf(searchKw);
                if (idx >= 0) {
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(plainText.length, idx + searchKw.length + 60);
                    excerpt = (start > 0 ? '…' : '') + plainText.substring(start, end) + (end < plainText.length ? '…' : '');
                } else {
                    excerpt = plainText.substring(0, 150);
                }
            } else {
                excerpt = plainText.substring(0, 150);
            }
            return { ...rest, excerpt, wordCount };
        });
        // 另外计算所有文章的 totalWordCount（不受分页影响）
        const allWordCount = articles.reduce((sum, a) => sum + (a.content ? a.content.length : 0), 0);

        res.json({ articles: items, total, page: pageNum, totalPages, totalWordCount: allWordCount });
    } catch (err) {
        res.status(500).json({ error: '获取文章列表失败喵~' });
    }
});

// 获取单篇文章详情
app.get('/api/wiki/:id', optionalAuth, (req, res) => {
    try {
        const articles = readJSON(KNOWLEDGE_FILE, []);
        const article = articles.find(a => a.id === req.params.id);
        if (!article) {
            return res.status(404).json({ error: '文章不存在喵~' });
        }
        // 浏览数 +1
        article.views = (article.views || 0) + 1;
        writeJSON(KNOWLEDGE_FILE, articles);
        res.json(article);
    } catch (err) {
        res.status(500).json({ error: '获取文章详情失败喵~' });
    }
});

// 上传图片
app.post('/api/wiki/upload', authMiddleware, upload.array('files', 5), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '请选择图片文件喵~' });
        }
        const urls = req.files.map(file => {
            const mime = detectImageMimeType(file.buffer);
            const ext = mime ? mime.split('/')[1] : 'png';
            const filename = `wiki_img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
            const filepath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, file.buffer);
            return { url: `/data/uploads/${filename}`, filename };
        });
        res.json(req.files.length === 1 ? urls[0] : urls);
    } catch (err) {
        res.status(500).json({ error: '图片上传失败喵~' });
    }
});

// 上传书籍文件
const BOOK_MIME_TYPES = {
    'application/pdf': 'pdf',
    'application/epub+zip': 'epub',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/x-markdown': 'md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc'
};
app.post('/api/wiki/upload-book', authMiddleware, upload.array('files', 3), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '请选择书籍文件喵~' });
        }
        const file = req.files[0];
        const mime = file.mimetype || 'application/octet-stream';
        const ext = BOOK_MIME_TYPES[mime];
        if (!ext) {
            return res.status(400).json({ error: '不支持的书籍格式，仅支持 PDF/EPUB/TXT/DOCX 喵~' });
        }
        if (file.size > 50 * 1024 * 1024) {
            return res.status(400).json({ error: '书籍文件不能超过 50MB 喵~' });
        }
        const safeName = file.originalname.replace(/[^a-zA-Z0-9一-鿿._-]/g, '_');
        const filename = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, file.buffer);
        res.json({
            url: `/data/uploads/${filename}`,
            filename: safeName,
            type: ext,
            size: file.size
        });
    } catch (err) {
        res.status(500).json({ error: '书籍上传失败喵~' });
    }
});

// 读取文本文件内容 (用于 TXT/MD 在线阅读)
app.get('/api/wiki/read-text', (req, res) => {
    try {
        const fileUrl = req.query.url;
        if (!fileUrl || !fileUrl.startsWith('/data/uploads/')) {
            return res.status(400).json({ error: '无效的文件路径喵~' });
        }
        const filepath = path.join(__dirname, fileUrl);
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '文件不存在喵~' });
        }
        const content = fs.readFileSync(filepath, 'utf8');
        const ext = path.extname(filepath).toLowerCase();
        res.json({ content, type: ext === '.md' ? 'md' : 'txt' });
    } catch (err) {
        res.status(500).json({ error: '读取文件失败喵~' });
    }
});

// 创建文章
app.post('/api/wiki', authMiddleware, (req, res) => {
    try {
        const { title, content, category, tags, bookFile } = req.body;

        if (!title || !title.trim() || title.trim().length < 3 || title.trim().length > 100) {
            return res.status(400).json({ error: '标题需要 3-100 个字符喵~' });
        }
        if ((!content || !content.trim()) && !bookFile) {
            return res.status(400).json({ error: '内容或书籍文件至少填一个喵~' });
        }
        if (content && content.length > 50000) {
            return res.status(400).json({ error: '内容不能超过 50000 个字符喵~' });
        }
        if (!category || !WIKI_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: '请选择有效的分类喵~' });
        }
        const tagList = Array.isArray(tags)
            ? tags.filter(t => t && t.trim()).map(t => t.trim().substring(0, 20)).slice(0, 10)
            : [];

        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const article = {
            id: generateId('kb_'),
            title: title.trim(),
            content: (content || '').trim(),
            category,
            tags: tagList,
            authorId: req.user.id,
            authorName: req.user.username,
            views: 0,
            createdAt: now,
            updatedAt: now
        };
        if (bookFile && bookFile.url) {
            article.bookFile = {
                url: bookFile.url,
                filename: bookFile.filename || '',
                type: bookFile.type || 'pdf',
                size: bookFile.size || 0
            };
        }

        const articles = readJSON(KNOWLEDGE_FILE, []);
        articles.push(article);

        // 容量修剪：每个用户最多 200 篇
        const myArticles = articles.filter(a => a.authorId === req.user.id);
        if (myArticles.length > 200) {
            const oldest = myArticles.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, myArticles.length - 200);
            oldest.forEach(a => {
                const idx = articles.findIndex(x => x.id === a.id);
                if (idx !== -1) articles.splice(idx, 1);
            });
        }

        writeJSON(KNOWLEDGE_FILE, articles);
        res.json(article);
    } catch (err) {
        res.status(500).json({ error: '创建文章失败喵~' });
    }
});

// 编辑文章（Wiki 模式：任意登录用户均可编辑）
app.put('/api/wiki/:id', authMiddleware, (req, res) => {
    try {
        const articles = readJSON(KNOWLEDGE_FILE, []);
        const index = articles.findIndex(a => a.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: '文章不存在喵~' });
        }

        const { title, content, category, tags, bookFile } = req.body;

        if (title !== undefined) {
            if (!title.trim() || title.trim().length < 3 || title.trim().length > 100) {
                return res.status(400).json({ error: '标题需要 3-100 个字符喵~' });
            }
            articles[index].title = title.trim();
        }
        if (content !== undefined) {
            if (content.length > 50000) {
                return res.status(400).json({ error: '内容不能超过 50000 个字符喵~' });
            }
            articles[index].content = content.trim();
        }
        if (category !== undefined) {
            if (!WIKI_CATEGORIES.includes(category)) {
                return res.status(400).json({ error: '请选择有效的分类喵~' });
            }
            articles[index].category = category;
        }
        if (tags !== undefined) {
            articles[index].tags = Array.isArray(tags)
                ? tags.filter(t => t && t.trim()).map(t => t.trim().substring(0, 20)).slice(0, 10)
                : [];
        }
        if (bookFile !== undefined) {
            if (bookFile === null) {
                articles[index].bookFile = undefined;
            } else if (bookFile.url) {
                articles[index].bookFile = {
                    url: bookFile.url,
                    filename: bookFile.filename || '',
                    type: bookFile.type || 'pdf',
                    size: bookFile.size || 0
                };
            }
        }

        articles[index].updatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        writeJSON(KNOWLEDGE_FILE, articles);
        res.json(articles[index]);
    } catch (err) {
        res.status(500).json({ error: '编辑文章失败喵~' });
    }
});

// 删除文章（仅作者本人可删）
app.delete('/api/wiki/:id', authMiddleware, (req, res) => {
    try {
        const articles = readJSON(KNOWLEDGE_FILE, []);
        const index = articles.findIndex(a => a.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: '文章不存在喵~' });
        }
        if (articles[index].authorId !== req.user.id) {
            return res.status(403).json({ error: '只能删除自己创建的文章喵~' });
        }
        articles.splice(index, 1);
        writeJSON(KNOWLEDGE_FILE, articles);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '删除文章失败喵~' });
    }
});

// =========================
// 🕰️ 「此刻」— 真实数据诗意卡片
// =========================

let momentCache = null;
let momentCacheTime = 0;
const MOMENT_CACHE_TTL = 1200000; // 20分钟

app.get('/api/this-moment', async (req, res) => {
    try {
        const now = Date.now();
        if (momentCache && (now - momentCacheTime) < MOMENT_CACHE_TTL) {
            return res.json(momentCache);
        }

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            if (momentCache) return res.json(momentCache);
            return res.status(503).json({ error: 'AI 服务未配置喵~' });
        }

        const themes = [
            '请联网搜索此刻地球上正在发生的真实数据，用一句诗意的话表达。不超过40字。',
            '请联网搜索此刻全球交通或物流的真实实时数据，用一句有画面感的话表达。不超过40字。',
            '请联网搜索此刻自然界正在发生的真实美好现象，用一句温柔的话表达。不超过40字。',
            '请联网搜索一个此刻关于人类活动的真实统计数字，用一句暖心的话表达。不超过40字。',
            '请联网搜索一个此刻关于太空的真实数据，用一句浪漫的话表达。不超过40字。',
            '请联网搜索一个此刻关于动物或宠物的真实趣闻，用一句俏皮的话表达。不超过40字。'
        ];
        const theme = themes[Math.floor(Math.random() * themes.length)];

        // 使用流式 + 联网搜索（与 AI 聊天端点一致的方式）
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-v4-pro',
                messages: [{
                    role: 'user',
                    content: `${theme}必须是联网搜索到的真实数据。不要markdown，不要引号包裹，不超过40字，直接输出。`
                }],
                enable_search: true,
                max_tokens: 393216,
                temperature: 0.7,
                stream: true
            }),
            signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('This-moment API error:', response.status, errText.substring(0, 200));
            throw new Error(`API ${response.status}`);
        }

        // 读取 SSE 流，收集所有 content token
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const jsonStr = trimmed.slice(6);
                if (jsonStr === '[DONE]') continue;
                try {
                    const chunk = JSON.parse(jsonStr);
                    const delta = chunk.choices?.[0]?.delta;
                    // 只收集最终答案 content，丢弃推理思考过程
                    if (delta?.content) text += delta.content;
                } catch (_) { /* 跳过解析失败的行 */ }
            }
        }

        text = text.trim();
        if (!text) throw new Error('Empty streaming response');

        momentCache = { text, timestamp: now };
        momentCacheTime = now;
        res.json(momentCache);
    } catch (err) {
        console.error('This-moment failed:', err.message);
        if (momentCache) {
            return res.json(momentCache);
        }
        res.status(503).json({ error: '此刻的数据正在路上喵~' });
    }
});

// =========================
// 🍜 「今天吃什么」— AI 食谱推荐
// =========================

// 服务端追踪最近推荐（按 IP），避免 prompt 注入风险
const recipeHistory = new Map(); // IP → [{ dish, time }]
const RECIPE_HISTORY_MAX = 10;
const RECIPE_HISTORY_TTL = 3600000; // 1小时过期

app.post('/api/recipe-suggest', async (req, res) => {
    try {
        const { ingredients, mood, diets } = req.body;

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'AI 服务未配置喵~' });
        }

        // 服务端获取该用户最近的推荐记录
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
        let history = recipeHistory.get(clientIp) || [];
        // 清理过期记录
        const now = Date.now();
        history = history.filter(h => (now - h.time) < RECIPE_HISTORY_TTL);
        const recentDishes = history.map(h => h.dish);

        const moodMap = {
            happy: '心情好想奖励自己',
            lazy: '懒得动想做简单的',
            sick: '不太舒服想吃清淡暖胃的',
            treat: '想犒劳自己吃顿好的'
        };
        const dietMap = {
            nospicy: '不吃辣',
            noseafood: '不吃海鲜',
            veggie: '素食',
            lactose: '乳糖不耐受',
            lowsugar: '控糖少糖'
        };

        const hasIngredients = ingredients && ingredients.trim();
        const moodText = mood ? (moodMap[mood] || '') : '';
        const dietText = (diets || []).map(d => dietMap[d]).filter(Boolean).join('，');
        const dietClause = dietText ? `忌口：${dietText}。` : '';
        const moodClause = moodText ? `心情：${moodText}。` : '';
        const ingredientClause = hasIngredients
            ? `食材：${ingredients.trim()}。请根据这些食材推荐一道菜（可以建议加1-2样常见调料/配菜）。`
            : '没有指定食材，请根据心情和忌口自由推荐一道家常菜。';

        const avoidClause = recentDishes.length > 0
            ? `请避开以下最近推荐过的菜：${recentDishes.join('、')}。推荐一道不同的。`
            : '';

        const cuisinePool = [
            '中式家常菜（川菜、粤菜、湘菜、东北菜等轮换）',
            '日式料理（丼物、煮物、炒め物等）',
            '韩式料理（拌饭、汤类、煎饼等）',
            '西式简餐（意面、沙拉、焗烤等）',
            '东南亚风味（泰式、越式等）',
            '创意融合菜'
        ];
        const cuisine = cuisinePool[Math.floor(Math.random() * cuisinePool.length)];

        const prompt = `${ingredientClause}
${moodClause}${dietClause}${avoidClause}
请优先从${cuisine}方向推荐。菜系每次轮换。

返回JSON格式：
{
  "dish": "菜名",
  "difficulty": "⭐简单/⭐⭐中等/⭐⭐⭐有点难",
  "time": "15分钟/30分钟/45分钟/1小时等",
  "steps": ["详细步骤1（包含具体用量、火候、时间）", "详细步骤2", "详细步骤3", "详细步骤4", "详细步骤5"],
  "catComment": "用可爱猫娘语气的一句话点评，带喵~结尾"
}

重要要求：
1. steps至少5步，每步详细描述（包含用量如"2勺生抽"、火候如"中火翻炒"、时间如"炖15分钟"）
2. 步骤语言通俗易懂，新手也能跟着做
3. 菜系风格每次尽量不同
4. catComment要俏皮可爱
只返回JSON，不要markdown代码块。`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-v4-pro',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.8
            })
        });

        const data = await response.json();
        if (!data.choices || !data.choices[0]) {
            throw new Error('DeepSeek API returned unexpected format');
        }
        const result = JSON.parse(data.choices[0].message.content);

        // 服务端记录推荐历史（按IP，自动过期）
        if (result.dish) {
            history.push({ dish: result.dish, time: Date.now() });
            if (history.length > RECIPE_HISTORY_MAX) history.shift();
            recipeHistory.set(clientIp, history);
        }

        res.json(result);
    } catch (err) {
        console.error('Recipe suggest error:', err.message);
        if (err.message.includes('JSON')) {
            console.error('Raw AI response was not valid JSON — check prompt');
        }
        res.status(500).json({ error: '小橘翻菜谱失败喵~请稍后再试' });
    }
});

// =========================
// 全局错误保护（防止进程崩溃导致网站打不开）
// =========================

// 捕获未处理的 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.error(`[${now}] 未处理的 Promise Rejection:`, reason?.message || reason);
    try {
        const logLine = `${now}: unhandledRejection — ${reason?.message || reason}\n`;
        fs.appendFileSync(path.join(__dirname, 'logs', 'err.log'), logLine);
    } catch (_) {}
    // 不退出进程，只记录日志
});

// 捕获未捕获的同步异常
process.on('uncaughtException', (err) => {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.error(`[${now}] 未捕获的异常:`, err.message);
    try {
        const logLine = `${now}: uncaughtException — ${err.message}\n${err.stack}\n`;
        fs.appendFileSync(path.join(__dirname, 'logs', 'err.log'), logLine);
    } catch (_) {}
    // 严重错误（如磁盘满、端口占用）仍需退出，其他情况恢复
    if (err.code === 'EADDRINUSE' || err.code === 'ENOSPC' || err.code === 'EACCES') {
        console.error('致命错误，退出进程:', err.code);
        process.exit(1);
    }
});

// 捕获 SIGTERM/SIGINT 优雅关闭
let isShuttingDown = false;
['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`收到 ${signal}，优雅关闭中...`);
        // 先停止接收新连接，然后强制关闭所有现有连接
        server?.close(() => {
            console.log('服务器已关闭所有连接');
            process.exit(0);
        });
        // 强制关闭所有 keepalive 连接，防止 server.close() 无限等待
        if (server) {
            server.closeIdleConnections?.();  // Node 18+
            // 兜底：5 秒后强制退出
            setTimeout(() => {
                console.log('强制退出进程');
                process.exit(0);
            }, 5000);
        }
    });
});

// =========================
// 启动服务器
// =========================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {

    console.log(
        `服务器已启动：http://localhost:${PORT}`
    );

    // 通知 PM2 应用已就绪（配合 wait_ready: true）
    if (typeof process.send === 'function') {
        process.send('ready');
    }

    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    try {
        fs.appendFileSync(path.join(__dirname, 'logs', 'out.log'), `${now}: 服务器已启动：http://localhost:${PORT}\n`);
    } catch (_) {}
});

// SSE 长连接超时设置：给予足够时间但不禁用超时
// keepAliveTimeout 不能为 0，否则优雅关闭时 server.close() 将永远无法完成
server.setTimeout(180000);        // 3 分钟请求超时（兼容 SSE）
server.keepAliveTimeout = 65000;  // 65 秒（略大于 nginx proxy_read_timeout 的常见值）
server.headersTimeout = 66000;    // 66 秒
