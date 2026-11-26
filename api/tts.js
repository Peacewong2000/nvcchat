// api/tts.js - MiniMax 粵語情感與多角色語音合成引擎 (speech-02-hd)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  try {
    // 接收文字、情緒標籤 (emotion)、角色音色 ID (voiceId)
    const {
      text,
      emotion = 'sad',
      voiceId = 'Cantonese_GentleLady' // 預設：溫柔成熟粵語女聲（日後可傳入長者或兒童 ID）
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 過濾括號內的動作描寫，例如 (小聲，顫抖) 或 （眼泛淚光），只保留廣東話對白
    const cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 確保 emotion 為 MiniMax 支援的有效值
    const validEmotions = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'];
    const finalEmotion = validEmotions.includes(emotion) ? emotion : 'sad';

    // 呼叫 MiniMax T2A v2 語音合成接口（國際版為 api.minimax.io，國內版請改為 api.minimaxi.com）
    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text: cleanText,
        stream: false,
        language_boost: 'Chinese,Yue', // 強制鎖定香港粵語口音與語氣助詞演繹
        voice_setting: {
          voice_id: voiceId,
          speed: 0.95,
          vol: 1.0,
          pitch: 0,
          emotion: finalEmotion
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1
        }
      })
    });

    const data = await response.json();

    if (!response.ok || (data.base_resp && data.base_resp.status_code !== 0)) {
      const errMsg = data.base_resp?.status_msg || JSON.stringify(data);
      return res.status(500).json({ error: `MiniMax TTS 錯誤: ${errMsg}` });
    }

    // MiniMax 回傳的音訊為 Hex 編碼字串，轉換為 MP3 二進位串流回傳給前端播放
    const hexAudio = data.data?.audio;
    if (!hexAudio) {
      return res.status(500).json({ error: 'MiniMax 未回傳音訊資料' });
    }

    const audioBuffer = Buffer.from(hexAudio, 'hex');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('MiniMax TTS Error:', error);
    return res.status(500).json({ error: `語音合成連線失敗: ${error.message}` });
  }
}