// api/tts.js - MiniMax 粵語成熟中年婦女聲線 (pitch: -2, speed: 0.90) ＋ 呼吸停頓與情緒聯動版
export default async function handler(req, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  // 查詢可用系統音色清單 (/api/tts?list=1)
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
      const cantoneseVoices = systemVoices.filter(v =>
        JSON.stringify(v).toLowerCase().includes('cantonese') ||
        JSON.stringify(v).includes('粵') ||
        JSON.stringify(v).includes('粤')
      );
      return res.status(200).json({
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
      voiceId = 'Cantonese_GentleLady'
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 1. 提取括號內的神態小字
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    const isTremblingOrScared = /顫抖|害怕|恐慌|驚慌|戰戰兢兢|吞吞吐吐|結巴|小聲/.test(stageDirections);
    const isCryingOrGuilty = /流淚|哭|哽咽|眼泛淚光|內疚|委屈|傷心|後悔|低頭/.test(stageDirections);
    const isDefensive = /激動|大聲|防衛|急|反駁/.test(stageDirections);

    // 2. 過濾括號內的動作描寫，保留廣東話對白
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 3. 利用 MiniMax 專屬停頓標籤 <#秒數#> 製造猶豫、喘氣與哽咽氣口
    cleanText = cleanText
      .replace(/……+/g, '<#0.7#>')
      .replace(/…+/g, '<#0.5#>');

    if (isTremblingOrScared) {
      cleanText = `唔…<#0.4#>` + cleanText.replace(/，/g, '，<#0.4#>');
    } else if (isCryingOrGuilty) {
      cleanText = `唉…<#0.45#>` + cleanText.replace(/，/g, '，<#0.35#>');
    } else {
      cleanText = cleanText.replace(/，/g, '，<#0.25#>');
    }

    // 4. 基礎語速設為 0.90，並依情緒微調語速與音量
    let finalEmotion = emotion;
    let dynamicSpeed = 0.90;
    let dynamicVolume = 1.0;

    if (isTremblingOrScared) {
      finalEmotion = 'fearful';
      dynamicSpeed = 0.86;
      dynamicVolume = 0.80;
    } else if (isCryingOrGuilty) {
      finalEmotion = 'sad';
      dynamicSpeed = 0.88;
      dynamicVolume = 0.88;
    } else if (isDefensive) {
      finalEmotion = 'angry';
      dynamicSpeed = 1.02;
      dynamicVolume = 1.12;
    } else {
      finalEmotion = 'calm';
      dynamicSpeed = 0.90;
      dynamicVolume = 1.0;
    }

    // 5. 呼叫 MiniMax speech-02-hd（設定 pitch: -2 呈現成熟中年婦女質感，不會變成男聲）
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
          voice_id: voiceId,
          speed: dynamicSpeed,
          vol: dynamicVolume,
          pitch: -2,
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
