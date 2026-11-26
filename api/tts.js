// api/tts.js - MiniMax 粵語真實喘氣、哽咽停頓與老年女聲版
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
      voiceId = 'Cantonese_GentleLady' // 可在 /api/tts?list=1 查出老婦人 ID 後替換此處
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 1. 讀取括號內的神態小字
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    const isTremblingOrScared = /顫抖|害怕|恐慌|驚慌|戰戰兢兢|吞吞吐吐|結巴|小聲/.test(stageDirections);
    const isCryingOrGuilty = /流淚|哭|哽咽|眼泛淚光|內疚|委屈|傷心|後悔|低頭/.test(stageDirections);
    const isDefensive = /激動|大聲|防衛|急|反駁/.test(stageDirections);

    // 2. 過濾括號內的動作描寫，保留對白
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    // 3. 關鍵戲劇化處理：利用 MiniMax 專屬停頓標籤 <#秒數#> 強制製造「抽泣、喘氣、猶豫」效果
    // 把所有「…」和「……」轉換成真實的氣口停頓
    cleanText = cleanText
      .replace(/……+/g, '<#0.75#>')
      .replace(/…+/g, '<#0.55#>');

    if (isTremblingOrScared) {
      // 害怕顫抖時：句首加入吸氣猶豫，逗號拉長停頓，製造吞吞吐吐感
      cleanText = `唔…<#0.45#>` + cleanText.replace(/，/g, '，<#0.45#>');
    } else if (isCryingOrGuilty) {
      // 哭泣哽咽時：句首加入輕微抽泣嘆氣，句中增加哽咽停頓
      cleanText = `唉…<#0.5#>` + cleanText.replace(/，/g, '，<#0.4#>');
    } else {
      cleanText = cleanText.replace(/，/g, '，<#0.25#>');
    }

    // 4. 根據情緒設定語速與音量（保持 pitch: 0 避免變男聲）
    let finalEmotion = emotion;
    let dynamicSpeed = 0.98;
    let dynamicVolume = 1.0;

    if (isTremblingOrScared) {
      finalEmotion = 'fearful';
      dynamicSpeed = 0.88; // 明顯放慢，配合停頓標籤產生顫抖猶豫感
      dynamicVolume = 0.78; // 壓低音量，呈現心虛小聲
    } else if (isCryingOrGuilty) {
      finalEmotion = 'sad';
      dynamicSpeed = 0.90;
      dynamicVolume = 0.85;
    } else if (isDefensive) {
      finalEmotion = 'angry';
      dynamicSpeed = 1.08;
      dynamicVolume = 1.15;
    } else {
      finalEmotion = 'calm';
      dynamicSpeed = 0.98;
      dynamicVolume = 1.0;
    }

    // 5. 呼叫 MiniMax speech-02-hd（hd 模型對 <#0.5#> 停頓與情緒細膩度遠勝 turbo）
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
