export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 DEEPSEEK_API_KEY' });
  }

  try {
    const { messages, temperature = 0.7 } = req.body || {};

    // 注意：刻意不傳入 response_format，避免 deepseek-flash 輸出全空白字元的已知問題
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
        max_tokens: 800
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
    return res.status(500).json({ error: `後端連線異常: ${error.message}` });
  }
}
