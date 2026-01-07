// 📁 handlers/media/generator.js
const Replicate = require('replicate');
const { OpenAI } = require('openai');
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * AI Director: מחליט אם לייצר תמונה
 */
async function shouldGenerateImage(text, context) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Analyze if this message needs a visual meme response. Return JSON: { "generate": boolean, "prompt": string (english visual description), "caption": string (hebrew) }` 
                },
                { role: "user", content: `Context: ${context}. Message: "${text}"` }
            ],
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (e) { return { generate: false }; }
}

/**
 * יצירת תמונה עם InstantID (החלפת פנים)
 */
async function generateMeme(faceImageBase64, prompt) {
    try {
        const output = await replicate.run(
            "adhikjoshi/instant-id:c7464987938159a9b51628430015524752315205103715199999598985187585",
            {
                input: {
                    image: faceImageBase64,
                    prompt: prompt + ", high quality, funny, meme style",
                    negative_prompt: "ugly, distorted",
                    num_inference_steps: 30
                }
            }
        );
        return output[0]; // URL
    } catch (e) {
        console.error("Replicate Error:", e);
        return null;
    }
}

module.exports = { shouldGenerateImage, generateMeme };