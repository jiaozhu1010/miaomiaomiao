/**
 * Python 教程 GitHub 同步核心逻辑
 * 消除 server.js 中 sync 和 auto-sync 两个端点之间约 200 行的重复代码
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 预定义教程章节结构
const PYTHON_TUTORIAL_SECTIONS = [
    { dir: 'Day01-20', title: 'Python 语言基础与进阶', icon: '🐍', startDay: 1 },
    { dir: 'Day21-30', title: 'Web 前端基础', icon: '🌐', startDay: 21 },
    { dir: 'Day31-35', title: '玩转 Linux', icon: '🐧', startDay: 31 },
    { dir: 'Day36-45', title: '数据库基础', icon: '🗄️', startDay: 36 },
    { dir: 'Day46-60', title: 'Django 实战', icon: '🎸', startDay: 46 },
    { dir: 'Day61-65', title: '爬虫入门', icon: '🕷️', startDay: 61 },
    { dir: 'Day66-80', title: '数据分析与机器学习', icon: '🤖', startDay: 66 },
    { dir: 'Day81-90', title: '团队项目开发', icon: '👥', startDay: 81 },
    { dir: 'Day91-100', title: '就业指导', icon: '💼', startDay: 91 },
    { dir: '公开课', title: '公开课', icon: '🎓', startDay: 101 },
    { dir: '番外篇', title: '番外篇', icon: '📎', startDay: 105 }
];

/**
 * 解析 Markdown 中图片的相对路径 → raw GitHub URL
 * 原先在 sync 和 auto-sync 中各定义了 2 次（共 4 次完全相同的实现）
 */
function resolveImgPath(filePath, imgPath) {
    const imgDir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (imgPath.startsWith('/')) return imgPath.slice(1);
    if (imgPath.startsWith('./')) return imgDir + '/' + imgPath.slice(2);
    if (imgPath.startsWith('../')) {
        const dirParts = imgDir.split('/');
        let relPath = imgPath;
        while (relPath.startsWith('../') && dirParts.length > 0) {
            dirParts.pop();
            relPath = relPath.slice(3);
        }
        return dirParts.join('/') + '/' + relPath;
    }
    return imgDir + '/' + imgPath;
}

/**
 * 处理单个 Markdown 文件：重写图片 URL、提取标题
 * @returns {{ title: string, content: string, slug: string, day: number }}
 */
function processMdFile(file, globalDay, rawBase) {
    let title = file.fileName.replace(/\.md$/i, '').replace(/^[\d._\-\s]+/, '').trim();
    if (!title) title = file.fileName;

    const htmlImgRegex = /(<img\s[^>]*?)src="((?!https?:\/\/)(?!data:)(?!\/data\/)[^"]+)"([^>]*>)/gi;
    const mdImgRegex = /!\[([^\]]*)\]\(((?!https?:\/\/)(?!data:)[^)]+)\)/g;

    // 重写图片 URL
    let content = (file.content || '').replace(mdImgRegex,
        (match, alt, imgPath) => `![${alt}](${rawBase}/${resolveImgPath(file.path, imgPath)})`
    );
    content = content.replace(htmlImgRegex,
        (match, before, imgPath, after) => before + 'src="' + rawBase + '/' + resolveImgPath(file.path, imgPath) + '"' + after
    );

    // 提取标题
    const h1Match = content.match(/^\s*#\s+(.+)$/m);
    if (h1Match) {
        const candidate = h1Match[1].trim();
        if (candidate.length >= 2 && !/^[a-z_-]+:\s*\d+$/i.test(candidate) && !/^\d+$/.test(candidate)) {
            title = candidate;
        }
    }

    const daySlug = 'day-' + String(globalDay).padStart(2, '0') + '-' +
        title.replace(/[^一-龥a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);

    return { day: globalDay, title, slug: daySlug, mdPath: file.path, content, sha: file.sha };
}

/**
 * 核心同步函数 — 从 GitHub 拉取 Python-100-Days 教程
 * 原先 sync 和 auto-sync 端点各自完整实现了一遍此逻辑
 *
 * @param {object} options
 * @param {string} options.tutorialFile - JSON 输出文件路径
 * @param {string} options.dataDir - data 目录路径
 * @param {function} options.writeJSON - 写 JSON 工具函数
 * @param {function} options.invalidateCache - 失效教程缓存
 * @returns {Promise<object>} 同步结果
 */
async function syncTutorialFromGitHub(options) {
    const { tutorialFile, dataDir, writeJSON, invalidateCache } = options;
    const repoUrl = 'https://api.github.com/repos/jackfrued/Python-100-Days';

    // Step 1: 获取仓库信息
    const repoRes = await fetch(repoUrl, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'miaosite' }
    });
    if (!repoRes.ok) throw new Error(`GitHub repo fetch failed: ${repoRes.status}`);
    const repoInfo = await repoRes.json();
    const defaultBranch = repoInfo.default_branch || 'master';
    const lastCommitSha = repoInfo.pushed_at || '';

    // Step 2: 获取文件树
    const treeUrl = `https://api.github.com/repos/jackfrued/Python-100-Days/git/trees/${defaultBranch}?recursive=1`;
    const treeRes = await fetch(treeUrl, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'miaosite' }
    });
    if (!treeRes.ok) throw new Error(`GitHub tree fetch failed: ${treeRes.status}`);
    const treeData = await treeRes.json();
    if (treeData.truncated) console.warn('[Python教程] 文件树被截断，仓库文件过多');

    // Step 3: 过滤 .md 文件并按目录分组
    const rawBase = `https://raw.githubusercontent.com/jackfrued/Python-100-Days/${defaultBranch}`;
    const dirFiles = {};
    let skippedCount = 0;

    for (const item of treeData.tree) {
        if (item.type !== 'blob') continue;
        if (!item.path.endsWith('.md') && !item.path.endsWith('.MD')) continue;
        const parts = item.path.split('/');
        if (parts.length < 2) { skippedCount++; continue; }
        if (parts.length > 3) continue;
        const dirName = parts[0];
        const fileName = parts.slice(1).join('/');
        if (!dirFiles[dirName]) dirFiles[dirName] = [];
        dirFiles[dirName].push({ path: item.path, fileName, sha: item.sha, size: item.size });
    }

    // Step 4: 按预定义 section 顺序构建
    const sections = [];
    let globalDay = 0;
    let fetchedCount = 0;
    const failedFiles = [];

    for (const secDef of PYTHON_TUTORIAL_SECTIONS) {
        const dirName = secDef.dir;
        const files = dirFiles[dirName] || [];

        let extraFiles = [];
        for (const [dname, dFiles] of Object.entries(dirFiles)) {
            if (dname !== dirName && dname.startsWith(dirName)) {
                extraFiles = extraFiles.concat(dFiles);
                delete dirFiles[dname];
            }
        }
        const allFiles = files.concat(extraFiles);
        delete dirFiles[dirName];
        allFiles.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'));

        const days = [];
        for (const file of allFiles) {
            globalDay++;
            let content = '';
            try {
                const rawUrl = `${rawBase}/${encodeURI(file.path).replace(/%2F/g, '/')}`;
                const contentRes = await fetch(rawUrl, { headers: { 'User-Agent': 'miaosite' } });
                if (contentRes.ok) {
                    content = await contentRes.text();
                    fetchedCount++;
                } else {
                    failedFiles.push(file.path);
                    console.warn(`[Python教程] 获取失败 (${contentRes.status}): ${file.path}`);
                    continue;
                }
            } catch (fetchErr) {
                failedFiles.push(file.path);
                console.warn(`[Python教程] 获取异常: ${file.path} — ${fetchErr.message}`);
                continue;
            }
            file.content = content; // 暂存 content 以便 processMdFile 使用
            days.push(processMdFile(file, globalDay, rawBase));
        }

        if (days.length > 0) {
            sections.push({
                id: 'sec-' + secDef.dir.toLowerCase(),
                title: secDef.title, icon: secDef.icon,
                slug: secDef.dir.toLowerCase(), startDay: secDef.startDay, days
            });
        }
    }

    // Step 5: 处理剩余未匹配目录
    for (const dirName of Object.keys(dirFiles)) {
        const files = dirFiles[dirName];
        files.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'));
        const days = [];
        for (const file of files) {
            globalDay++;
            let content = '';
            try {
                const rawUrl = `${rawBase}/${encodeURI(file.path).replace(/%2F/g, '/')}`;
                const contentRes = await fetch(rawUrl, { headers: { 'User-Agent': 'miaosite' } });
                if (contentRes.ok) { content = await contentRes.text(); fetchedCount++; }
                else { failedFiles.push(file.path); continue; }
            } catch (e) { failedFiles.push(file.path); continue; }
            file.content = content;
            days.push(processMdFile(file, globalDay, rawBase));
        }
        if (days.length > 0) {
            sections.push({
                id: 'sec-' + dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                title: dirName, icon: '📎',
                slug: dirName.toLowerCase(), startDay: days[0].day, days
            });
        }
    }

    // Step 6: 排序
    sections.sort((a, b) => {
        const aIdx = PYTHON_TUTORIAL_SECTIONS.findIndex(s => s.dir === a.slug.toUpperCase() || a.slug.startsWith(s.dir.toLowerCase()));
        const bIdx = PYTHON_TUTORIAL_SECTIONS.findIndex(s => s.dir === b.slug.toUpperCase() || b.slug.startsWith(s.dir.toLowerCase()));
        if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
        if (aIdx >= 0) return -1;
        if (bIdx >= 0) return 1;
        return a.startDay - b.startDay;
    });

    // Step 7: 保存
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const tutorialData = {
        syncedAt: now,
        repoInfo: { owner: 'jackfrued', repo: 'Python-100-Days', defaultBranch, lastCommitSha },
        sections
    };
    await writeJSON(tutorialFile, tutorialData);
    invalidateCache();

    // Step 8: 下载图片到本地
    let imgDownloaded = 0, imgFailed = 0;
    try {
        const imgDir = path.join(dataDir, 'python_tutorial_images');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

        const imgMap = new Map();
        for (const section of sections) {
            for (const day of section.days) {
                const regexes = [
                    /!\[[^\]]*\]\((https:\/\/raw\.githubusercontent\.com\/jackfrued\/Python-100-Days\/[^)]+)\)/g,
                    /<img\s[^>]*src="(https:\/\/raw\.githubusercontent\.com\/jackfrued\/Python-100-Days\/[^"]+)"[^>]*>/gi
                ];
                for (const regex of regexes) {
                    let m;
                    while ((m = regex.exec(day.content)) !== null) {
                        const rawUrl = m[1];
                        if (!imgMap.has(rawUrl)) {
                            const urlObj = new URL(rawUrl);
                            const relParts = urlObj.pathname.split('/').slice(4);
                            const localName = relParts.join('_').replace(/[<>:"\\|?*#]/g, '_');
                            imgMap.set(rawUrl, localName);
                        }
                    }
                }
            }
        }

        console.log(`[Python教程] 发现 ${imgMap.size} 张图片，开始下载到本地...`);

        const imgEntries = [...imgMap.entries()];
        for (let i = 0; i < imgEntries.length; i++) {
            const [rawUrl, localName] = imgEntries[i];
            const localPath = path.join(imgDir, localName);
            if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) { imgDownloaded++; continue; }
            try {
                const imgRes = await fetch(rawUrl, { headers: { 'User-Agent': 'miaosite' } });
                if (imgRes.ok) {
                    fs.writeFileSync(localPath, Buffer.from(await imgRes.arrayBuffer()));
                    imgDownloaded++;
                } else { imgFailed++; }
            } catch (e) { imgFailed++; }
            if ((i + 1) % 10 === 0) {
                console.log(`[Python教程] 图片下载: ${i + 1}/${imgEntries.length} (成功 ${imgDownloaded}, 失败 ${imgFailed})`);
            }
        }

        // URL 替换为本地路径
        let urlReplaced = 0;
        for (const section of sections) {
            for (const day of section.days) {
                for (const [rawUrl, localName] of imgEntries) {
                    const localPath = path.join(imgDir, localName);
                    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
                        const before = day.content.length;
                        day.content = day.content.split(rawUrl).join('/data/python_tutorial_images/' + localName);
                        if (day.content.length !== before) urlReplaced++;
                    }
                }
            }
        }

        await writeJSON(tutorialFile, tutorialData);
        invalidateCache();
        console.log(`[Python教程] 图片处理完成: 下载 ${imgDownloaded}, 失败 ${imgFailed}, URL替换 ${urlReplaced}`);
    } catch (imgErr) {
        console.error('[Python教程] 图片下载出错:', imgErr.message);
    }

    return { sections, globalDay, fetchedCount, skippedCount, failedFiles, imgDownloaded, imgFailed };
}

module.exports = { syncTutorialFromGitHub, PYTHON_TUTORIAL_SECTIONS };
