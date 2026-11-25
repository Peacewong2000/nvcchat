// api/tts.js - 優化版 Azure 香港粵語女聲（加入自然呼吸停頓，消除機械感）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastasia';

  if (!speechKey) {
    return res.status(500).json({ error: '未設定 AZURE_SPEECH_KEY 環境變數' });
  }

  try {
    const { text, trustScore = 25 } = req.body;
    if (!text) return res.status(400).json({ error: '缺少文字' });

    // 移除括號動作描寫
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .trim();

    if (!cleanText) return res.status(204).end();

    // 跳脫 XML 字元
    cleanText = cleanText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 關鍵優化：將「……」或「…」轉換為自然停頓標籤，避免語音引擎生硬重讀
    cleanText = cleanText.replace(/…+/g, '<break time="420ms"/>');

    const rate = trustScore < 40 ? '-8%' : trustScore < 70 ? '-4%' : '0%';
    const pitch = trustScore < 40 ? '+1%' : '0%';

    // 改用更溫柔自然的香港女聲 zh-HK-HiuMaanNeural（曉曼）
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-HK"><voice name="zh-HK-HiuMaanNeural"><prosody rate="${rate}" pitch="${pitch}">${cleanText}</prosody></voice></speak>`;

    const ttsUrl = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'FamilyNVCSimulator',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(audioBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
