// netlify/functions/muyu.js
export async function handler(event, context) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = "global_muyu_count";
  
    if (!url || !token) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing Upstash Config" }) };
    }
  
    // 获取全服总数
    if (event.httpMethod === 'GET') {
      try {
        const res = await fetch(`${url}/get/${key}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const count = data.result ? parseInt(data.result) : 0;
        return { statusCode: 200, body: JSON.stringify({ total: count }) };
      } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: "Failed to get count" }) };
      }
    }
  
    // 增加敲击次数
    if (event.httpMethod === 'POST') {
      try {
        const body = JSON.parse(event.body);
        const clicksToAdd = body.count || 0;
  
        if (clicksToAdd > 0) {
          const res = await fetch(`${url}/incrby/${key}/${clicksToAdd}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          return { statusCode: 200, body: JSON.stringify({ latestTotal: data.result }) };
        }
        return { statusCode: 400, body: JSON.stringify({ error: "No count provided" }) };
      } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: "Failed to add count" }) };
      }
    }
  
    return { statusCode: 405, body: "Method Not Allowed" };
  }