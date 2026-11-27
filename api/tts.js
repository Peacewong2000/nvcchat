// api/tts.js - 支援五組自訂情緒復刻男女聲線 ＋ 廣東話疑問句尾音上揚優化版
export default async function handler(req, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const DEFAULT_WIFE_SAD = 'moss_audio_4a030779-ea95-11f1-b685-fa73a44f4e6e';
    const DEFAULT_HUSBAND_CALM = 'moss_audio_5c9ed502-ea8b-11f1-a529-aac3beb84f85';

    const {
      text,
      emotion = 'sad',
      voiceId,
      role = 'wife'
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    const finalVoiceId = voiceId || (role === 'husband' ? DEFAULT_HUSBAND_CALM : DEFAULT_WIFE_SAD);

    // 1. 過濾括號內的動作描寫，保留 DeepSeek 生成的原文語氣
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 2. 強化廣東話疑問句聲調：
    // - 統一將半形 ? 轉為全形 ？，並移除問號前多餘的省略號（避免「…？」把問號語調壓平）
    // - 若問句結尾缺少粵語疑問助詞，自動補上自然輕聲助詞「呀？」引導聲帶上揚
    cleanText = cleanText
      .replace(/\?/g, '？')
      .replace(/[…\.]+？/g, '？')
      .replace(/([^呀嗎嘛咩呢㗎啦喎無好])？/g, '$1呀？')
      .replace(/……+/g, '<#0.35#>')
      .replace(/…+/g, '<#0.2#>');

    const hasQuestion = cleanText.includes('？');

    // 3. 針對情緒微調語速與音量；若包含疑問句，將 pitch 微調 +1 幫助句尾音調上揚
    let dynamicSpeed = 1.05;
    let dynamicVolume = 1.0;
    let dynamicPitch = hasQuestion ? 1 : 0;

    if (emotion === 'fearful') {
      dynamicSpeed = 1.01;
      dynamicVolume = 0.88;
    } else if (emotion === 'sad') {
      dynamicSpeed = 1.03;
      dynamicVolume = 0.92;
    } else if (emotion === 'angry') {
      dynamicSpeed = role === 'wife' ? 1.15 : 1.10;
      dynamicVolume = role === 'wife' ? 1.14 : 1.12;
      dynamicPitch = hasQuestion ? 2 : 0; // 激動反問時音調再提高少許，反問感更強
    } else {
      dynamicSpeed = 1.06;
      dynamicVolume = 1.02;
    }

    // 4. 呼叫 MiniMax speech-02-hd 合成復刻人聲
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
        language_boost: 'Chinese,Yue',
        voice_setting: {
          voice_id: finalVoiceId,
          speed: dynamicSpeed,
          vol: dynamicVolume,
          pitch: dynamicPitch,
          emotion: emotion
        },
        audio_setting: {
          sample_rate: 24000,
          bitrate: 64000,
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
