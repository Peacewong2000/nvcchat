// 此檔案放在 GitHub 倉庫的 api/chat.js 路徑下
// Vercel 會自動將它部署為無伺服器後端函數 (Serverless Function)

export default async function handler(req, res) {
    // 僅允許 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 從 Vercel 環境變數中安全讀取 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: '伺服器尚未設定 DEEPSEEK_API_KEY 環境變數' });
    }

    try {
        const { messages } = req.body;

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: messages,
                response_format: { type: 'json_object' },
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data?.error?.message || 'DeepSeek API 呼叫失敗' });
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: '後端連線發生錯誤: ' + error.message });
    }
}
