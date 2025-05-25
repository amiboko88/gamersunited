// 📁 utils/generateRulesImage.js
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRulesImage() {
  const prompt = `
  This digital poster for GAMERS UNITED IL highlights the weekly rules with a military-inspired design featuring soldiers, moody lighting, and intense action. Include bold text: "WEEKLY RULES" and "GAMERS UNITED IL".
  `;

  const response = await openai.images.generate({
    prompt,
    n: 1,
    size: "1024x768",
    response_format: "b64_json"
  });

  const b64 = response.data[0].b64_json;
  const buffer = Buffer.from(b64, 'base64');
  const outputPath = path.join(__dirname, '../assets/banner.png');
  fs.writeFileSync(outputPath, buffer);
  console.log('🖼️ Weekly rules banner generated and saved.');
}

module.exports = { generateRulesImage };
