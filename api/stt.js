// api/stt.js - 接收前端錄製的 WAV 音訊並呼叫 Azure 廣東話語音辨識 (zh-HK)
export const config = {
  api: {
    bodyParser: false, // 關閉預設 JSON 解析，直接接收二進位 WAV 音訊串流
  },
};

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
    // 讀取前端傳來的 WAV 音訊資料
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer || audioBuffer.length < 1000) {
      return res.status(200).json({ text: '' });
    }

    // 呼叫 Azure Speech-to-Text REST API (指定香港粵語 zh-HK)
    const azureUrl = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-HK&format=simple`;

    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Accept': 'application/json',
      },
      body: audioBuffer,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.Message || 'Azure STT 辨識失敗' });
    }

    // 回傳辨識到的廣東話文字
    return res.status(200).json({
      text: data.DisplayText || '',
      status: data.RecognitionStatus,
    });
  } catch (error) {
    console.error('Azure STT Error:', error);
    return res.status(500).json({ error: '語音辨識伺服器連線失敗' });
  }
}
