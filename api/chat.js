// api/chat.js - 加速版 DeepSeek 轉接器（防止 Vercel 10秒超時）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 DEEPSEEK_API_KEY 環境變數' });
  }

  try {
    const { messages, temperature = 0.7, response_format } = req.body;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature,
        max_tokens: 800,
        ...(response_format ? { response_format } : {})
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: `DeepSeek API 錯誤 (${response.status}): ${rawText}` });
    }

    const data = JSON.parse(rawText);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: `後端連線異常: ${error.message}` });
  }
}
