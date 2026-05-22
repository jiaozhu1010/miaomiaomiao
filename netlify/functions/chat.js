exports.handler = async (event, context) => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // GET 请求：获取最新的 40 条聊天记录
        if (event.httpMethod === 'GET') {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify(['LRANGE', 'miao_chat_list', '0', '-1'])
            });
            const data = await response.json();
            
            // 解析出消息列表
            const messages = (data.result || []).map(item => JSON.parse(item));
            return { statusCode: 200, headers, body: JSON.stringify({ messages }) };
        } 
        
        // POST 请求：发送新留言
        else if (event.httpMethod === 'POST') {
            const { nickname, content } = JSON.parse(event.body || '{}');
            
            if (!content || content.trim() === '') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: '内容不能为空' }) };
            }

            const newMessage = {
                nickname: (nickname || '神秘喵').substring(0, 10),
                content: content.substring(0, 100), // 限制100字，防止灌水
                // 强制使用亚洲/上海时区（北京时间），并输出完整的年月日时分秒
                time: new Date().toLocaleString('zh-CN', { 
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false
                })
            };

            // 1. 将新消息塞入 Redis 列表头部
            await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify(['LPUSH', 'miao_chat_list', JSON.stringify(newMessage)])
            });

            // 2. 修剪列表，只保留最新的 100 条，防止撑爆数据库
            await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify(['LTRIM', 'miao_chat_list', '0', '99'])
            });

            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
