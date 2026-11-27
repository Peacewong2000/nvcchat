// api/tts.js - 支援復刻老婦人女聲 ＋ 沉穩粵語男聲（含自動偵測與男聲後備機制）
export default async function handler(req, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 MINIMAX_API_KEY 環境變數' });
  }

  // 瀏覽器打開 /api/tts?list=1 可查看帳號內所有可用的粵語系統音色 ID
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
        cantonese_voices: cantoneseVoices.length > 0 ? cantoneseVoices : systemVoices.slice(0, 50)
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const CLONED_WIFE_VOICE_ID = 'moss_audio_7b1027a9-e9bd-11f1-9c05-5e85d72bfa83';

    const {
      text,
      emotion = 'sad',
      voiceId = CLONED_WIFE_VOICE_ID,
      role = 'wife' // 'wife' 或 'husband'
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: '缺少要朗讀的文字' });
    }

    // 1. 讀取括號內的神態小字，調整語速與音量
    const stageDirections = (text.match(/[（(]([^）)]+)[）)]/g) || []).join(' ');
    const isTremblingOrScared = /顫抖|害怕|恐慌|驚慌|戰戰兢兢|吞吞吐吐|結巴|小聲/.test(stageDirections);
    const isCryingOrGuilty = /流淚|哭|哽咽|眼泛淚光|內疚|委屈|傷心|後悔|低頭|心痛|失望/.test(stageDirections);
    const isDefensive = /激動|大聲|防衛|急|反駁|憤怒|拍檯/.test(stageDirections);

    // 2. 過濾括號內的動作描寫
    let cleanText = text
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleanText) {
      return res.status(204).end();
    }

    cleanText = cleanText
      .replace(/……+/g, '<#0.35#>')
      .replace(/…+/g, '<#0.2#>');

    let finalEmotion = emotion;
    let dynamicSpeed = 1.06;
    let dynamicVolume = 1.0;

    if (isTremblingOrScared) {
      finalEmotion = 'fearful';
      dynamicSpeed = 1.02;
      dynamicVolume = 0.88;
    } else if (isCryingOrGuilty) {
      finalEmotion = 'sad';
      dynamicSpeed = 1.04;
      dynamicVolume = 0.92;
    } else if (isDefensive) {
      finalEmotion = 'angry';
      dynamicSpeed = 1.14;
      dynamicVolume = 1.12;
    } else {
      finalEmotion = 'calm';
      dynamicSpeed = 1.08;
      dynamicVolume = 1.02;
    }

    // 輔助函式：向 MiniMax 發送合成請求
    async function requestMiniMaxTTS(targetVoiceId, targetPitch = 0) {
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
            voice_id: targetVoiceId,
            speed: dynamicSpeed,
            vol: dynamicVolume,
            pitch: targetPitch,
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
      if (response.ok && data.base_resp?.status_code === 0 && data.data?.audio) {
        return Buffer.from(data.data.audio, 'hex');
      }
      return null;
    }

    let audioBuffer = null;

    if (role === 'husband') {
      // 嘗試常見粵語男聲系統 ID，若該 ID 未開通則自動嘗試下一個，最後使用降調粵語音色保底
      const candidateMaleVoices = [
        voiceId,
        'Cantonese_Gentleman',
        'Cantonese_MatureMan',
        'Cantonese_ProfessionalHost（M)',
        'Cantonese_Narrator'
      ].filter(Boolean);

      for (const candidateId of candidateMaleVoices) {
        audioBuffer = await requestMiniMaxTTS(candidateId, 0);
        if (audioBuffer) break;
      }

      // 若帳號內無任何預設粵語男聲 ID，自動改用可用粵語聲線並降調 pitch: -4 呈現沉穩中年男聲（絕不靜音）
      if (!audioBuffer) {
        audioBuffer = await requestMiniMaxTTS('Cantonese_GentleLady', -4)
          || await requestMiniMaxTTS(CLONED_WIFE_VOICE_ID, -4);
      }
    } else {
      // 妻子角色：使用復刻老婦人聲線
      audioBuffer = await requestMiniMaxTTS(voiceId || CLONED_WIFE_VOICE_ID, 0);
    }

    if (!audioBuffer) {
      return res.status(500).json({ error: 'MiniMax 無法生成語音，請檢查餘額或音色設定' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('MiniMax TTS Error:', error);
    return res.status(500).json({ error: `語音合成連線失敗: ${error.message}` });
  }
}