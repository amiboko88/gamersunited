// 📁 utils/dalleImage.js
const fetch = require('node-fetch');

async function generateDalleImage(prompt = 'A colorful gaming weekly schedule background with Hebrew feel, Warzone vibes, futuristic, energetic') {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024'
    })
  });

  if (!response.ok) {
    console.error('❌ שגיאה ב־DALL·E:', await response.text());
    throw new Error('שגיאה ביצירת רקע מה־DALL·E');
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;

  if (!imageUrl) throw new Error('לא הוחזר URL תקני מה־DALL·E');

  // הורדה בפועל של התמונה כ־Buffer
  const imageRes = await fetch(imageUrl);
  const buffer = await imageRes.buffer();

  return buffer;
}

module.exports = { generateDalleImage };
