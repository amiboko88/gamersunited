// 📁 handlers/ttsTester.js
// ✅ גרסה משודרגת עם בחירה אקראית של קולות וטקסטים

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const OpenAI = require('openai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

// --- מאגרי מידע לבדיקות אקראיות ---

// מאגר הקולות של OpenAI
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// מאגר הקולות האיכותיים (WaveNet) של גוגל לעברית
const GOOGLE_HE_VOICES = ['he-IL-Wavenet-A', 'he-IL-Wavenet-B', 'he-IL-Wavenet-C', 'he-IL-Wavenet-D'];

// מאגר טקסטים לבדיקה
const TEST_PHRASES = [
    'יאללה, איזה באסה',
    'פאק, זה לא עובד',
    'ג\'יזס, תתחבר כבר',
    'בדיקה, אחת שתיים שלוש',
    'שמעון מבצע בדיקת מערכות קול',
    'האם שומעים אותי היטב?',
    'טוב, בוא נראה איך זה נשמע',
    'זה מבחן קול עבור שמעון הבוט',
    'לעזאזל, הפינג גבוה היום'
];

// --- הגדרות ומשתני סביבה ---
const TEST_CHANNEL_ID = '1396779274173943828';

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
let isTestRunning = false;

// --- פונקציות עזר לייצור קול (מעודכנות לקבל קול דינמי) ---
async function generateOpenAIVoice(text, voice) {
    const mp3 = await openai.audio.speech.create({ model: 'tts-1-hd', voice: voice, input: text });
    return Buffer.from(await mp3.arrayBuffer());
}

async function generateGoogleVoice(text, voice) {
    if (!googleTtsClient) throw new Error('Google TTS client is not initialized.');
    const [response] = await googleTtsClient.synthesizeSpeech({
        input: { text }, voice: { languageCode: 'he-IL', name: voice }, audioConfig: { audioEncoding: 'MP3' },
    });
    return response.audioContent;
}

// --- הפונקציה המרכזית שה-voiceHandler קורא לה ---
async function runTTSTest(member) {
    if (isTestRunning) return;
    isTestRunning = true;
    
    log(`[TTS_TESTER] ➡️  התחלת בדיקת TTS עבור ${member.displayName}`);
    
    // בחירה אקראית של מנוע
    const engineToUse = Math.random() < 0.5 ? 'openai' : 'google';

    if (engineToUse === 'google' && !googleTtsClient) {
        log('[TTS_TESTER] ⚠️ מנוע גוגל לא זמין, מדלג על הבדיקה.');
        isTestRunning = false;
        return;
    }

    // בחירה אקראית של קול וטקסט
    const voiceToUse = engineToUse === 'openai' 
        ? OPENAI_VOICES[Math.floor(Math.random() * OPENAI_VOICES.length)]
        : GOOGLE_HE_VOICES[Math.floor(Math.random() * GOOGLE_HE_VOICES.length)];
    
    const textToSpeak = TEST_PHRASES[Math.floor(Math.random() * TEST_PHRASES.length)];

    log(`[TTS_TESTER] Running test with: | Engine: ${engineToUse.toUpperCase()} | Voice: ${voiceToUse} | Text: "${textToSpeak}"`);

    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: member.voice.channelId, guildId: member.guild.id, adapterCreator: member.guild.voiceAdapterCreator,
        });

        const audioBuffer = await (engineToUse === 'google' 
            ? generateGoogleVoice(textToSpeak, voiceToUse) 
            : generateOpenAIVoice(textToSpeak, voiceToUse));
        
        const player = createAudioPlayer();
        const resource = createAudioResource(Readable.from(audioBuffer));
        connection.subscribe(player);
        player.play(resource);

        await entersState(player, AudioPlayerStatus.Playing, 5_000);
        await entersState(player, AudioPlayerStatus.Idle, 30_000);
        
    } catch (error) {
        log.error(`[TTS_TESTER] ❌ שגיאה קריטית בתהליך הבדיקה:`, error);
    } finally {
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
        isTestRunning = false;
    }
}

module.exports = {
    runTTSTest,
    TEST_CHANNEL_ID
};