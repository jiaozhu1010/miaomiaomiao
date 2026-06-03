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

// 数据文件路径
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');
const BARCODE_HISTORY_FILE = path.join(DATA_DIR, 'barcode_history.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');
const CHAT_FILE = path.join(__dirname, 'chat.json');

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

app.set('trust proxy', true);

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
        '/chat.json', '/.htaccess', '/.user.ini'
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
app.use(express.static(__dirname));


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

function writeJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        'utf8'
    );
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

// 获取聊天记录 — 公共大厅，无需登录
app.get('/api/chat', optionalAuth, (req, res) => {
    updateOnlineUser(req);

    const allMessages = readJSON(CHAT_FILE, []);
    let messages;
    if (req.user) {
        messages = allMessages.filter(
            m => m.userId === req.user.id || !m.userId
        );
    } else {
        messages = allMessages;
    }

    res.json({ messages, onlineCount: getOnlineCount() });
});


// 发送聊天 — 公共大厅，支持匿名
app.post('/api/chat', optionalAuth, (req, res) => {
    const { nickname, content } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: '内容不能为空' });
    }

    const messages = readJSON(CHAT_FILE, []);

    // 昵称优先级：已登录用用户名，否则用前端传来的匿名昵称
    const finalNickname = req.user
        ? req.user.username.substring(0, 10)
        : (nickname || '匿名猫咪').substring(0, 10);

    const newMessage = {
        nickname: finalNickname,
        content: content.substring(0, 100),
        time: new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }),
        userId: req.user ? req.user.id : null
    };

    messages.unshift(newMessage);
    const finalMessages = messages.slice(0, 100);
    writeJSON(CHAT_FILE, finalMessages);

    res.json({ success: true });
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
        const { mode, messages: messagesJson, settings: settingsJson } = req.body;
        const files = req.files || [];

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

        // 选择系统 prompt
        const systemPrompt = mode === 'code' ? CODE_SYSTEM_PROMPT : CAT_SYSTEM_PROMPT + catToneAddon;

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
        res.flushHeaders();

        let fullContent = '';

        // 🔥 每 15 秒发送 keep-alive 注释，防止 nginx/proxy 超时断开
        const keepAliveInterval = setInterval(() => {
            try { res.write(': keepalive\n\n'); } catch (_) {}
        }, 15000);

        try {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-v4-pro',
                    messages: finalMessages,
                    max_tokens: deepThinkingEnabled ? (mode === 'code' ? 8192 : 4096) : (mode === 'code' ? 4096 : 1024),
                    temperature: mode === 'code' ? 0.7 : 1.0,
                    stream: true,
                    ...(webSearchEnabled ? {
                        enable_search: true,
                        search_result_count: webSearchCount
                    } : {}),
                    ...(deepThinkingEnabled ? {
                        thinking: { type: 'enabled' }
                    } : {})
                }),
                signal: AbortSignal.timeout(180000)  // 3 分钟兜底超时
            });

            if (!response.ok) {
                clearInterval(keepAliveInterval);
                const errorText = await response.text();
                console.error('AI 聊天 API 错误:', response.status, errorText);
                // 提取 API 返回的具体错误信息
                let errorMsg = 'AI 服务返回异常，请稍后重试';
                try {
                    const errJson = JSON.parse(errorText);
                    if (errJson.error?.message) errorMsg = errJson.error.message;
                    else if (errJson.message) errorMsg = errJson.message;
                } catch (_) {
                    if (errorText && errorText.length < 200) errorMsg = errorText;
                }
                res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                return;
            }

            // 逐行读取 DeepSeek 的 SSE 流
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
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

                    const dataStr = trimmed.slice(6);
                    if (dataStr === '[DONE]') {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta;
                        if (delta?.thinking) {
                            res.write(`data: ${JSON.stringify({ thinking: delta.thinking })}\n\n`);
                        }
                        if (delta?.content) {
                            fullContent += delta.content;
                            res.write(`data: ${JSON.stringify({ token: delta.content })}\n\n`);
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
            return res.status(400).json({ error: '文件太大了，单个文件不能超过10MB喵~' });
        }
        console.error('AI 聊天请求准备失败:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'AI 服务异常' });
        } else {
            try { res.write(`data: ${JSON.stringify({ error: '处理请求时出错' })}\n\n`); } catch (_) {}
            try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (_) {}
            res.end();
        }
    }
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
// 启动服务器
// =========================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {

    console.log(
        `服务器已启动：http://localhost:${PORT}`
    );
});

// SSE 长连接需要足够的超时时间，禁用 Node.js HTTP 默认超时
server.setTimeout(0);
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
