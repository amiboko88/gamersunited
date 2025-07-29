// 📁 handlers/ttsTester.js
// ✅ גרסה סופית - מותאמת באופן מלא לקריאה מ-voiceHandler.js

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const OpenAI = require('openai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

// --- הגדרות ומשתני סביבה ---
const TEST_CHANNEL_ID = '1396779274173943828';
const SHIMON_VOICE_OPENAI = 'onyx';
const SHIMON_VOICE_GOOGLE = 'he-IL-Wavenet-C';

// --- אתחול הלקוחות של שירותי ה-API ---
const openai = new OpenAI(); 
let googleTtsClient;
const googleCredentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

if (googleCredentialsJson) {
    try {
        const credentials = JSON.parse(googleCredentialsJson);
        googleTtsClient = new TextToSpeechClient({ credentials });
    } catch (error) {
        log.error('[TTS_TESTER] ❌ Failed to parse GOOGLE_CREDENTIALS_JSON.', error);
        googleTtsClient = null;
    }
}

// --- משתני עזר ---
let nextEngine = 'openai';
let isTestRunning = false;

// --- פונקציות עזר לייצור קול ---
async function generateOpenAIVoice(text) {
    const mp3 = await openai.audio.speech.create({ model: 'tts-1-hd', voice: SHIMON_VOICE_OPENAI, input: text });
    return Buffer.from(await mp3.arrayBuffer());
}

async function generateGoogleVoice(text) {
    if (!googleTtsClient) throw new Error('Google TTS client is not initialized.');
    const [response] = await googleTtsClient.synthesizeSpeech({
        input: { text }, voice: { languageCode: 'he-IL', name: SHIMON_VOICE_GOOGLE }, audioConfig: { audioEncoding: 'MP3' },
    });
    return response.audioContent;
}


// --- ✨ הפונקציה המרכזית שה-voiceHandler קורא לה ---
async function runTTSTest(member) {
    if (isTestRunning) {
        log('[TTS_TESTER] בדיקה כבר רצה, מדלג על הפעלה כפולה.');
        return;
    }

    isTestRunning = true;
    log(`[TTS_TESTER] ➡️  התחלת בדיקת TTS עבור ${member.displayName}`);
    
    let engineToUse = nextEngine;
    nextEngine = (engineToUse === 'openai') ? 'google' : 'openai';
    
    if (engineToUse === 'google' && !googleTtsClient) {
        log('[TTS_TESTER] ⚠️ מנוע גוגל לא זמין, עובר ל-OpenAI.');
        engineToUse = 'openai'; 
        nextEngine = 'google';
    }

    log(`[TTS_TESTER] נבחר מנוע: [${engineToUse.toUpperCase()}]`);

    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: member.voice.channelId, guildId: member.guild.id, adapterCreator: member.guild.voiceAdapterCreator,
        });

        const textToSpeak = `היי ${member.displayName}, שמעון בודק את מנוע הקול של ${engineToUse}.`;
        const audioBuffer = await (engineToUse === 'google' ? generateGoogleVoice(textToSpeak) : generateOpenAIVoice(textToSpeak));
        
        const player = createAudioPlayer();
        const resource = createAudioResource(Readable.from(audioBuffer));
        connection.subscribe(player);
        player.play(resource);

        await entersState(player, AudioPlayerStatus.Playing, 5_000);
        log('[TTS_TESTER] ✅ הניגון התחיל.');

        await entersState(player, AudioPlayerStatus.Idle, 30_000);
        log('[TTS_TESTER] ✅ הניגון הסתיים.');
        
    } catch (error) {
        log.error(`[TTS_TESTER] ❌ שגיאה קריטית בתהליך הבדיקה:`, error);
    } finally {
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
        isTestRunning = false;
        log('[TTS_TESTER] ⏹️  תהליך הבדיקה הסתיים.');
    }
}

// --- ייצוא המודול ---
module.exports = {
    runTTSTest,
    TEST_CHANNEL_ID
};