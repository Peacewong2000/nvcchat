// api/tts.js - MiniMax 年老婦女粵語情感聲線 ＋ 神態細字聯動 ＋ 高速版
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  try {
    const {
      text,
      emotion = 'sad',
      voiceId = 'Cantonese_GentleLady' // 配合下方 pitch: -4，模擬 55-65 歲退休年老婦女聲線
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 1. 提取括號內的神態細字，根據細字關鍵詞強制決定真實情緒、語速與音量
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    let detectedEmotion = emotion;
    let dynamicSpeed = 1.02;
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
      dynamicSpeed = 1.08;
      dynamicVolume = 1.1;
    } else if (/安全|平靜|釋懷|鬆一口氣|點頭/.test(stageDirections)) {
      detectedEmotion = 'calm';
      dynamicSpeed = 1.02;
      dynamicVolume = 1.0;
    } else if (/小聲|細聲|心虛/.test(stageDirections)) {
      dynamicVolume = 0.8;
      dynamicSpeed = 0.96;
    }

    // 2. 過濾括號內的動作描寫，只保留廣東話對白給語音引擎朗讀
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

    // 3. 使用 speech-02-turbo 大幅提升生成速度（減少等待延遲），並將 pitch 設為 -4 呈現年老婦女成熟滄桑質感
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
          pitch: -4, // 降調模擬 55-65 歲退休婦女聲線（若想更年長可調至 -6）
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
      return res.status(500).json({ error: `MiniMax TTS 錯誤: ${errMsg}` }); }  const hexAudio = data.data?.audio; if (!hexAudio) { return res.status(500).json({ error: 'MiniMax 未回傳音訊資料' }); }  const audioBuffer = Buffer.from(hexAudio, 'hex'); res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Content-Length', audioBuffer.length); return res.status(200).send(audioBuffer); } catch (error) { console.error('MiniMax TTS Error:', error); return res.status(500).json({ error: `語音合成連線失敗: ${error.message}` });
  }
}
