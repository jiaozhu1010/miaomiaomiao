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
        if (event.httpMethod === 'GET') {
            const response = await fetch(`${url}/get/muyu_global_count`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            const count = data.result ? parseInt(data.result, 10) : 0;
            return { statusCode: 200, headers, body: JSON.stringify({ count }) };
        } else if (event.httpMethod === 'POST') {
            const { count } = JSON.parse(event.body || '{}');
            const incrementValue = parseInt(count, 10) || 0;

            if (incrementValue <= 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid count' }) };
            }

            const response = await fetch(`${url}/incrby/muyu_global_count/${incrementValue}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            return { statusCode: 200, headers, body: JSON.stringify({ count: parseInt(data.result, 10) }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};