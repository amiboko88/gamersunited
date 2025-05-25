// 📁 utils/dalleLeaderboardImage.js
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateLeaderboardImage(usernames = [], imagePath) {
  const prompt = `Create a stylish futuristic leaderboard poster titled 'Gamers United IL – Leaderboard'.
List the top 10 players by name in the following order:
${usernames.map((name, i) => `${i + 1}. ${name}`).join('\n')}
Use English text only, a dark gaming background, and vibrant design.`;

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024'
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) throw new Error('No image URL returned from OpenAI');

    const res = await fetch(imageUrl);
    const buffer = await res.arrayBuffer();

    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    fs.writeFileSync(imagePath, Buffer.from(buffer));
    console.log(`✅ תמונת Leaderboard נשמרה: ${imagePath}`);
  } catch (err) {
    console.error('❌ שגיאה ביצירת תמונת Leaderboard:', err);
  }
}

module.exports = { generateLeaderboardImage };
