// 📁 handlers/ttsTester.js
// ✅ גרסה סופית - עובדת עם משתנה סביבה בלבד, ללא קבצים

const { Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
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

// --- ✨ הדרך הנכונה והנוחה לעבוד עם Railway ---
// קוראים את כל ה-JSON מתוך משתנה סביבה אחד
const googleCredentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

if (googleCredentialsJson) {
    try {
        // מפענחים את ה-JSON מהמשתנה ומאתחלים את הלקוח
        const credentials = JSON.parse(googleCredentialsJson);
        googleTtsClient = new TextToSpeechClient({ credentials });
        log('[TTS_TESTER] ✅ Google TTS client initialized successfully from environment variable.');
    } catch (error) {
        log.error('[TTS_TESTER] ❌ Failed to parse GOOGLE_CREDENTIALS_JSON. Make sure you copied the entire file content.', error);
        googleTtsClient = null; // ודא שהלקוח לא מאותחל אם יש שגיאה
    }
} else {
    log('[TTS_TESTER] ⚠️ GOOGLE_CREDENTIALS_JSON environment variable not found. Google TTS will be disabled.');
}
// --- סוף השינוי המרכזי ---


// --- לוגיקת הבוחן ---
let nextEngine = 'openai'; 

async function generateOpenAIVoice(text) {
    log(`[TTS_TESTER] --> [OpenAI] Generating audio...`);
    const mp3 = await openai.audio.speech.create({
        model: 'tts-1-hd', voice: SHIMON_VOICE_OPENAI, input: text,
    });
    return Buffer.from(await mp3.arrayBuffer());
}

async function generateGoogleVoice(text) {
    if (!googleTtsClient) throw new Error('Google TTS client is not initialized.');
    log(`[TTS_TESTER] --> [Google] Generating audio...`);
    const [response] = await googleTtsClient.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'he-IL', name: SHIMON_VOICE_GOOGLE },
        audioConfig: { audioEncoding: 'MP3' },
    });
    return response.audioContent;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    if (newState.channelId === TEST_CHANNEL_ID && oldState.channelId !== TEST_CHANNEL_ID) {
        log('[TTS_TESTER] ➡️  Voice state update detected in test channel. Starting process.');
        
        const member = newState.member;
        let engineToUse = nextEngine;
        nextEngine = (engineToUse === 'openai') ? 'google' : 'openai';
        
        if (engineToUse === 'google' && !googleTtsClient) {
            log('[TTS_TESTER] ⚠️ Google engine is not available, falling back to OpenAI.');
            engineToUse = 'openai';
            nextEngine = 'google';
        }

        log(`[TTS_TESTER] Selected engine: [${engineToUse.toUpperCase()}]`);

        let connection;
        try {
            connection = joinVoiceChannel({
                channelId: newState.channelId,
                guildId: newState.guild.id,
                adapterCreator: newState.guild.voiceAdapterCreator,
            });

            const textToSpeak = `היי ${member.displayName}, שמעון בודק את מנוע הקול של ${engineToUse}.`;
            const audioBuffer = await (engineToUse === 'google'
                ? generateGoogleVoice(textToSpeak)
                : generateOpenAIVoice(textToSpeak));

            const audioResource = createAudioResource(Readable.from(audioBuffer));
            const player = createAudioPlayer();
            connection.subscribe(player);
            player.play(audioResource);

            player.on(AudioPlayerStatus.Idle, () => {
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });
            player.on('error', error => {
                log.error(`[TTS_TESTER] ❌ Audio player error:`, error);
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });

        } catch (error) {
            log.error(`[TTS_TESTER] ❌ Critical error during test process:`, error);
            if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
        }
    }
  },
};