// 📁 handlers/ttsTester.js
// גרסה סופית ומתוקנת - שימוש נכון בלוגר לפי מבנה הפרויקט

const { Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const OpenAI = require('openai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const path = require('path');
const fs = require('fs');

// --- הגדרות ומשתני סביבה ---
const TEST_CHANNEL_ID = '1396779274173943828';
const SHIMON_VOICE_OPENAI = 'onyx';
const SHIMON_VOICE_GOOGLE = 'he-IL-Wavenet-C';

// --- אתחול הלקוחות של שירותי ה-API ---
const openai = new OpenAI(); 
let googleTtsClient;
const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'google-credentials.json');

if (fs.existsSync(googleCredentialsPath)) {
    googleTtsClient = new TextToSpeechClient({ keyFilename: googleCredentialsPath });
    log('[TTS_TESTER] Google TTS client initialized successfully.'); // FIX
} else {
    log(`[TTS_TESTER] Google credentials file not found at: ${googleCredentialsPath}. Google TTS will be disabled for testing.`); // FIX
}

// --- לוגיקת הבוחן ---
let nextEngine = 'openai'; 

async function generateOpenAIVoice(text) {
    log(`[TTS_TESTER] Generating OpenAI TTS...`); // FIX
    const mp3 = await openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: SHIMON_VOICE_OPENAI,
        input: text,
    });
    return Buffer.from(await mp3.arrayBuffer());
}

async function generateGoogleVoice(text) {
    if (!googleTtsClient) throw new Error('Google TTS client not initialized.');
    log(`[TTS_TESTER] Generating Google TTS...`); // FIX
    const request = {
        input: { text },
        voice: { languageCode: 'he-IL', name: SHIMON_VOICE_GOOGLE },
        audioConfig: { audioEncoding: 'MP3' },
    };
    const [response] = await googleTtsClient.synthesizeSpeech(request);
    return response.audioContent;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    if (newState.channelId === TEST_CHANNEL_ID && oldState.channelId !== TEST_CHANNEL_ID) {
        const member = newState.member;
        let engineToUse = nextEngine;
        
        nextEngine = (engineToUse === 'openai') ? 'google' : 'openai';
        
        if (engineToUse === 'google' && !googleTtsClient) {
            log('[TTS_TESTER] Skipping Google TTS test (client not configured). Falling back to OpenAI.'); // FIX
            engineToUse = 'openai';
            nextEngine = 'google';
        }

        log(`[TTS_TESTER] User ${member.displayName} joined. Testing with [${engineToUse.toUpperCase()}]`); // FIX

        const connection = joinVoiceChannel({
            channelId: newState.channelId,
            guildId: newState.guild.id,
            adapterCreator: newState.guild.voiceAdapterCreator,
        });

        try {
            const textToSpeak = `היי ${member.displayName}, שמעון בודק את מנוע הקול של ${engineToUse}.`;
            const audioBuffer = (engineToUse === 'google')
                ? await generateGoogleVoice(textToSpeak)
                : await generateOpenAIVoice(textToSpeak);

            const audioResource = createAudioResource(Readable.from(audioBuffer));
            const player = createAudioPlayer();
            connection.subscribe(player);
            player.play(audioResource);

            player.on(AudioPlayerStatus.Idle, () => {
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });
            player.on('error', error => {
                log.error(`[TTS_TESTER] Audio player error:`, error);
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });

        } catch (error) {
            log.error(`[TTS_TESTER] Failed to process TTS with ${engineToUse}:`, error);
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        }
    }
  },
};