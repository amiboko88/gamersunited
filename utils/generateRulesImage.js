const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRulesImage() {
  const prompt = `
A clean, modern gaming poster with a military Warzone-style background.
Centered white bold text: "GAMERS UNITED IL" on top, "RULES" below it.
Dark blue-gray tones, minimal design, no random symbols, no extra text.
  `;

  try {
    const response = await openai.images.generate({
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    const b64 = response.data[0].b64_json;
    const buffer = Buffer.from(b64, 'base64');
    const outputPath = path.join(__dirname, '../assets/banner.png');
    fs.writeFileSync(outputPath, buffer);
    console.log('🖼️ Weekly rules banner generated and saved.');
  } catch (err) {
    console.error('❌ Error generating rules image:', err.message);
  }
}

module.exports = { generateRulesImage };
