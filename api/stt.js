// api/stt.js - Azure 香港廣東話 (zh-HK) 高準確率語音辨識版
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastasia';

  if (!speechKey) {
    return res.status(500).json({ error: 'Vercel 尚未設定 AZURE_SPEECH_KEY 環境變數' });
  }

  try {
    // 讀取前端傳來的 WAV 音訊二進位資料
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer || audioBuffer.length < 1000) {
      return res.status(200).json({ text: '' });
    }

    // 呼叫 Azure Speech REST API (zh-HK 香港粵語，開啟 detailed 模式取得最高準確率)
    const endpoint = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-HK&format=detailed&profanity=raw`;

    const azureRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey.trim(),
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Accept': 'application/json'
      },
      body: audioBuffer
    });

    const data = await azureRes.json();

    if (!azureRes.ok) {
      return res.status(500).json({ error: `Azure STT 錯誤: ${JSON.stringify(data)}` });
    }

    // 優先取 NBest 第一候選結果（含完整標點），其次取 DisplayText
    let recognizedText = '';
    if (data.RecognitionStatus === 'Success') {
      recognizedText = (data.NBest && data.NBest[0] && data.NBest[0].Display)
        ? data.NBest[0].Display
        : (data.DisplayText || '');
    }

    // 常見香港廣東話同音字自動修正表
    recognizedText = recognizedText
      .replace(/比人呃|俾人扼|比人扼/g, '俾人呃')
      .replace(/幫青|幫輕吓/g, '幫輕下')
      .replace(/差管|差舘/g, '差館')
      .replace(/養老今|養老根/g, '養老金')
      .replace(/五十萬|50萬/g, '50萬')
      .replace(/阿陳太|陳太/g, '陳太')
      .replace(/唔緊要|唔緊腰/g, '唔緊要');

    return res.status(200).json({ text: recognizedText.trim() });
  } catch (error) {
    console.error('STT Error:', error);
    return res.status(500).json({ error: `語音辨識失敗: ${error.message}` });
  }
}