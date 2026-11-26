// api/tts.js - MiniMax 粵語情感聲線（修正男聲問題＋支援查詢長者/兒童音色清單）
export default async function handler(req, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  // 新增功能：在瀏覽器直接輸入 /api/tts?list=1 即可查看 MiniMax 帳號內所有可用音色 ID
  if (req.method === 'GET' && req.query.list === '1') {
    try {
      const voiceRes = await fetch('https://api.minimax.io/v1/get_voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({ voice_type: 'system' })
      });
      const voiceData = await voiceRes.json();
      const systemVoices = voiceData.system_voice || [];
      // 篩選出與粵語 (Cantonese) 或長者/女性相關的音色
      const cantoneseVoices = systemVoices.filter(v =>
        JSON.stringify(v).toLowerCase().includes('cantonese') ||
        JSON.stringify(v).includes('粵') ||
        JSON.stringify(v).includes('粤')
      );
      return res.status(200).json({
        total_system_voices: systemVoices.length,
        cantonese_voices: cantoneseVoices.length > 0 ? cantoneseVoices : systemVoices.slice(0, 40)
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const {
      text,
      emotion = 'sad',
      voiceId = 'Cantonese_GentleLady' // 可在下方修改為查詢到的老婦人 ID，例如 Cantonese_Granny / Cantonese_KindGrandma
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 1. 提取括號內的神態細字，聯動情緒、語速與音量
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    let detectedEmotion = emotion;
    let dynamicSpeed = 1.0;
    let dynamicVolume = 1.0;

    if (/顫抖|害怕|恐慌|驚慌|戰戰兢兢|吞吞吐吐|結巴/.test(stageDirections)) {
      detectedEmotion = 'fearful';
      dynamicSpeed = 0.94;
      dynamicVolume = 0.85;
    } else if (/流淚|哭|哽咽|眼泛淚光|內疚|委屈|傷心|後悔|低頭/.test(stageDirections)) {
      detectedEmotion = 'sad';
      dynamicSpeed = 0.96;
      dynamicVolume = 0.9;
    } else if (/激動|大聲|防衛|委屈防衛|急|反駁/.test(stageDirections)) {
      detectedEmotion = 'angry';
      dynamicSpeed = 1.06;
      dynamicVolume = 1.1;
    } else if (/安全|平靜|釋懷|鬆一口氣|點頭/.test(stageDirections)) {
      detectedEmotion = 'calm';
      dynamicSpeed = 1.0;
      dynamicVolume = 1.0;
    } else if (/小聲|細聲|心虛/.test(stageDirections)) {
      dynamicVolume = 0.8;
      dynamicSpeed = 0.96;
    }

    // 2. 過濾括號內的動作描寫
    const cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    const validEmotions = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'];
    const finalEmotion = validEmotions.includes(detectedEmotion) ? detectedEmotion : 'sad';

    // 3. 呼叫 MiniMax speech-02-turbo（pitch 必須保持 0，切勿設負數以免變成男聲）
    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'speech-02-turbo',
        text: cleanText,
        stream: false,
        language_boost: 'Chinese,Yue',
        voice_setting: {
          voice_id: voiceId,
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
