// api/tts.js - 保留 DeepSeek 原生破碎語氣 ＋ 復刻老婦人聲線
export default async function handler(req, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const CLONED_WIFE_VOICE_ID = 'moss_audio_7b1027a9-e9bd-11f1-9c05-5e85d72bfa83';

    const {
      text,
      emotion = 'sad',
      voiceId
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    const finalVoiceId = (!voiceId || voiceId === 'Cantonese_GentleLady')
      ? CLONED_WIFE_VOICE_ID
      : voiceId;

    // 1. 讀取括號內的神態小字，僅用來微調語速與音量
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    const isTremblingOrScared = /顫抖|害怕|恐慌|驚慌|戰戰兢兢|吞吞吐吐|結巴|小聲/.test(stageDirections);
    const isCryingOrGuilty = /流淚|哭|哽咽|眼泛淚光|內疚|委屈|傷心|後悔|低頭/.test(stageDirections);
    const isDefensive = /激動|大聲|防衛|急|反駁/.test(stageDirections);

    // 2. 過濾括號內的動作描寫，完整保留 DeepSeek 生成的原文破碎語氣
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 3. 僅將原文已有的省略號「…」轉成自然氣口停頓，不額外加字
    cleanText = cleanText
      .replace(/……+/g, '<#0.55#>')
      .replace(/…+/g, '<#0.35#>');

    let finalEmotion = emotion;
    let dynamicSpeed = 0.98;
    let dynamicVolume = 1.0;

    if (isTremblingOrScared) {
      finalEmotion = 'fearful';
      dynamicSpeed = 0.90;
      dynamicVolume = 0.80;
    } else if (isCryingOrGuilty) {
      finalEmotion = 'sad';
      dynamicSpeed = 0.92;
      dynamicVolume = 0.85;
    } else if (isDefensive) {
      finalEmotion = 'angry';
      dynamicSpeed = 1.06;
      dynamicVolume = 1.12;
    } else {
      finalEmotion = 'calm';
      dynamicSpeed = 1.0;
      dynamicVolume = 1.02;
    }

    // 4. 呼叫 MiniMax speech-02-hd
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
          pitch: 0,
          emotion: finalEmotion
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
