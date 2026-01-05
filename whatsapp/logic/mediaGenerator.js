// 📁 whatsapp/logic/mediaGenerator.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Replicate = require('replicate');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// נתיב בסיס לתמונות הפנים
const FACES_DIR = path.join(__dirname, '../assets/faces');

/**
 * משיג תמונת מקור (מקומית או פרופיל)
 */
async function getSourceImage(sock, senderId, senderName) {
    // 1. חיפוש בתיקיות מקומיות (לפי טלפון או מיפוי שם)
    const potentialFolders = [senderId]; 
    const nameMapping = {
        'יוגי': 'yogi', 'עומרי': 'omri', 'שרון': 'sharon', 'קלימרו': 'amit',
        'מתן': 'matan', 'עמית': 'amit', 'רועי': 'roi'
    };
    
    for (const [heb, eng] of Object.entries(nameMapping)) {
        if (senderName.includes(heb)) potentialFolders.push(eng);
    }

    for (const folder of potentialFolders) {
        const userPath = path.join(FACES_DIR, folder);
        if (fs.existsSync(userPath)) {
            const files = fs.readdirSync(userPath).filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
            if (files.length > 0) {
                const randomFile = files[Math.floor(Math.random() * files.length)];
                return { 
                    type: 'base64', 
                    data: `data:image/jpeg;base64,${fs.readFileSync(path.join(userPath, randomFile)).toString('base64')}` 
                };
            }
        }
    }

    // 2. משיכת תמונת פרופיל מוואטסאפ בזמן אמת
    try {
        const ppUrl = await sock.profilePictureUrl(senderId + '@s.whatsapp.net', 'image');
        if (ppUrl) return { type: 'url', data: ppUrl };
    } catch (e) {
        // אין תמונת פרופיל
    }

    return null;
}

/**
 * 🧠 המוח הויזואלי - מחליט אם ומתי לייצר תמונה
 * זה מחליף את כל ה-If/Else הישנים
 */
async function getAiVisualDirectorDecision(text, senderName, context) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // מודל מהיר וזול
            messages: [
                { 
                    role: "system", 
                    content: `
                    אתה "הבמאי הויזואלי" של בוט בשם שמעון.
                    תפקידך להחליט אם ההודעה הנוכחית מצדיקה יצירת תמונה (Meme/Reaction) שתוסיף ערך קומי לשיחה.
                    
                    חוקים:
                    1. **אל תייצר תמונה על כל הודעה!** רק אם זה מצחיק, דרמטי, או פאנץ' חזק. (Target: 20-30% of messages).
                    2. אם המשתמש שואל שאלה אינפורמטיבית - אל תייצר תמונה.
                    3. אם החלטת שכן: תכתוב Prompt באנגלית ל-Stable Diffusion שמתאר את הסיטואציה בצורה ויזואלית ומצחיקה.
                    4. התמונה תמיד תכלול דמות מרכזית (אנחנו נדביק עליה את הפנים של המשתמש).
                    
                    החזר JSON בלבד:
                    {
                        "shouldGenerate": boolean,
                        "prompt": string (תיאור באנגלית לתמונה, למשל: "A fat gamer crying over a broken keyboard, dramatic lighting"),
                        "caption": string (טקסט קצר בעברית לתמונה, סרקסטי)
                    }
                    ` 
                },
                { role: "user", content: `המשתמש ${senderName} כתב: "${text}". הקשר: ${context}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
        console.error('Director AI Error:', e);
        return { shouldGenerate: false };
    }
}

/**
 * שליחה ל-Replicate (InstantID)
 */
async function generateInstantID(imageSource, prompt) {
    const input = {
        image: imageSource.data,
        prompt: prompt + ", 8k realism, cinematic lighting, masterpiece, high quality",
        negative_prompt: "ugly, deformed, disfigured, cartoon, anime, low quality, blur, watermark, text",
        style_strength: 0,
        ip_adapter_strength: 0.8,
        num_inference_steps: 30,
        guidance_scale: 5
    };

    const output = await replicate.run(
        "adhikjoshi/instant-id:c7464987938159a9b51628430015524752315205103715199999598985187585",
        { input }
    );
    return output[0];
}

/**
 * הפונקציה הראשית
 */
async function generateContextualMedia(sock, senderId, senderName, senderNameEng, intentData, text) {
    // 1. בדיקה האם יש בכלל עם מה לעבוד (תמונת מקור)
    // אנחנו עושים את זה *לפני* ה-AI כדי לא לבזבז כסף על החלטה אם אי אפשר לבצע אותה
    const sourceImage = await getSourceImage(sock, senderId, senderName);
    if (!sourceImage) return null;

    // 2. שואלים את ה"במאי" (AI) מה לעשות
    const decision = await getAiVisualDirectorDecision(text, senderName, intentData.category);

    // אם ה-AI החליט שזה לא זמן טוב לתמונה - יוצאים
    if (!decision.shouldGenerate) {
        return null;
    }

    log(`[MediaGen] 🎬 Director decided to generate: "${decision.prompt}"`);

    // 3. ביצוע (Replicate)
    try {
        const aiImageUrl = await generateInstantID(sourceImage, decision.prompt);
        return { type: 'image', url: aiImageUrl, caption: decision.caption };
    } catch (error) {
        console.error(`[MediaGen] ❌ Replicate Error: ${error.message}`);
        return null;
    }
}

module.exports = { generateContextualMedia };