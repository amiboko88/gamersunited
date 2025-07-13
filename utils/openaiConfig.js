// 📁 utils/openaiConfig.js
const OpenAI = require('openai');

// ✅ יצירת אובייקט OpenAI פעם אחת בלבד
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = openai;