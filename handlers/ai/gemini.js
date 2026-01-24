const axios = require('axios');
const { log } = require('../../utils/logger');

const API_KEY = process.env.GEMINI_STUDIO_AI;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Generate content using Google Gemini via REST API (No SDK required)
 * @param {Array} parts - Array of content parts: [{text: "..."}, {inlineData: {mimeType: "...", data: "..."}}]
 * @param {String} model - Model name (default: gemini-2.0-flash)
 * @returns {Promise<String>} Generated text
 */
async function generateContent(parts, model = "gemini-2.0-flash") {
    if (!API_KEY) {
        log('❌ [Gemini] Missing GOOGLE_AI_KEY or GEMINI_API_KEY in env.');
        return "Error: System configuration missing API Key.";
    }

    // Convert internal simplified 'parts' to Gemini REST API format
    // Internal: { inlineData: { mimeType, data } } -> API: { inline_data: { mime_type, data } }
    const contents = [{
        parts: parts.map(p => {
            if (p.text) return { text: p.text };
            if (p.inlineData) {
                return {
                    inline_data: {
                        mime_type: p.inlineData.mimeType,
                        data: p.inlineData.data
                    }
                };
            }
            return p;
        })
    }];

    try {
        const url = `${BASE_URL}/${model}:generateContent?key=${API_KEY}`;

        // Retry Mechanism for 429 (Rate Limit) 🛡️
        const MAX_RETRIES = 3;
        let attempt = 0;
        let response;

        while (attempt < MAX_RETRIES) {
            try {
                response = await axios.post(url, {
                    contents: contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1000
                    }
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });
                break; // Success!
            } catch (err) {
                if (err.response && err.response.status === 429) {
                    attempt++;
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                    log(`⏳ [Gemini] Rate Limit (429). Retrying in ${delay / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})`);
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    throw err; // Not a rate limit, throw normally
                }
            }
        }

        if (!response) throw new Error("Max retries exceeded for Gemini API.");

        const candidates = response.data?.candidates;
        if (!candidates || candidates.length === 0) return "";

        const text = candidates[0].content?.parts?.[0]?.text || "";
        return text;

    } catch (error) {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message;
        log(`❌ [Gemini] REST API Error (${status}): ${msg}`);
        return "";
    }
}

module.exports = { generateContent };
