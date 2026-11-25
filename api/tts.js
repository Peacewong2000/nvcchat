// api/tts.js - 呼叫 Azure 香港粵語女聲 (zh-HK-HiuGaaiNeural) 並根據情緒調節語氣
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
    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 過濾括號內的動作描寫，例如 (小聲，害怕) 或 （眼泛淚光），只讀出對白
    const cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 跳脫 XML 特殊字元
    const escapedText = cleanText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // 根據妻子的安全感分數 (trustScore 0-100) 動態微調語速與音調：
    // 分數低時（害怕、吞吐）：語速較慢 (-10%)、音調微高帶緊張感 (+2%)
    // 分數高時（感到安全、釋懷）：語速接近自然 (-3%)、音調柔和 (0%)
    const rate = trustScore < 40 ? '-10%' : trustScore < 70 ? '-6%' : '-2%';
    const pitch = trustScore < 40 ? '+2%' : '0%';

    // 組合 SSML 語音合成指令（使用微軟最自然的香港女聲 zh-HK-HiuGaaiNeural）
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-HK">
        <voice name="zh-HK-HiuGaaiNeural">
          <prosody rate="${rate}" pitch="${pitch}">
            ${escapedText}
          </prosody>
        </voice>
      </speak>
    `.trim();

    const ttsUrl = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'FamilyNVCSimulator',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Azure TTS 錯誤: ${errText}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('Azure TTS Error:', error);
    return res.status(500).json({ error: '語音合成伺服器連線失敗' });
  }
}
