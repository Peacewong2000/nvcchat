// api/chat.js - DeepSeek API 代理（開啟原生 JSON 模式以杜絕分析報告解析錯誤）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 DEEPSEEK_API_KEY 環境變數' });
  }

  try {
    const { messages, temperature = 0.7 } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '缺少有效的 messages 對話內容' });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: temperature,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `DeepSeek API 錯誤 (${response.status})`
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    return res.status(500).json({ error: `伺服器連線失敗: ${error.message}` });
  }
}