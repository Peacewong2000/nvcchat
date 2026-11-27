// api/chat.js - DeepSeek API 代理（防空白回傳自動重試 ＋ 穩定 JSON 模式）
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

    async function callDeepSeekOnce(useStrictJson) {
      const payload = {
        model: 'deepseek-chat',
        messages: messages,
        temperature: temperature,
        max_tokens: 2048
      };
      if (useStrictJson) {
        payload.response_format = { type: 'json_object' };
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `DeepSeek API 錯誤 (${response.status})`);
      }
      return data;
    }

    // 第一次嘗試（使用嚴格 JSON 模式）
    let data = await callDeepSeekOnce(true);
    let content = (data.choices?.[0]?.message?.content || '').trim();

    // 若 DeepSeek 偶發輸出空白內容，自動關閉嚴格鎖並重試一次，確保 100% 有回應
    if (!content) {
      data = await callDeepSeekOnce(false);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    return res.status(500).json({ error: `伺服器連線失敗: ${error.message}` });
  }
}
