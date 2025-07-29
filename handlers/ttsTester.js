// 📁 handlers/ttsTester.js
// גרסה חדשה עם לוגים מפורטים לאיתור תקלות

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
    log('[TTS_TESTER] ✅ Google TTS client initialized.');
} else {
    log(`[TTS_TESTER] ⚠️ Google credentials file not found at: ${googleCredentialsPath}.`);
}

// --- לוגיקת הבוחן ---
let nextEngine = 'openai'; 

async function generateOpenAIVoice(text) {
    log(`[TTS_TESTER] --> [OpenAI] מנסה לייצר שמע...`);
    const mp3 = await openai.audio.speech.create({
        model: 'tts-1-hd', voice: SHIMON_VOICE_OPENAI, input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    log(`[TTS_TESTER] --> [OpenAI] שמע נוצר בהצלחה (גודל: ${buffer.length} בתים).`);
    return buffer;
}

async function generateGoogleVoice(text) {
    if (!googleTtsClient) throw new Error('Google TTS client not initialized.');
    log(`[TTS_TESTER] --> [Google] מנסה לייצר שמע...`);
    const [response] = await googleTtsClient.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'he-IL', name: SHIMON_VOICE_GOOGLE },
        audioConfig: { audioEncoding: 'MP3' },
    });
    const buffer = response.audioContent;
    log(`[TTS_TESTER] --> [Google] שמע נוצר בהצלחה (גודל: ${buffer.length} בתים).`);
    return buffer;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    // שלב 1: בדיקה ראשונית אם זה האירוע הנכון
    if (newState.channelId === TEST_CHANNEL_ID && oldState.channelId !== TEST_CHANNEL_ID) {
        log('[TTS_TESTER] ➡️  זוהתה כניסה לערוץ הטסטים. מתחיל תהליך.');
        
        const member = newState.member;
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
            // שלב 2: התחברות לערוץ הקולי
            log('[TTS_TESTER] מנסה להתחבר לערוץ הקולי...');
            connection = joinVoiceChannel({
                channelId: newState.channelId,
                guildId: newState.guild.id,
                adapterCreator: newState.guild.voiceAdapterCreator,
            });
            log('[TTS_TESTER] ✅ התחברתי לערוץ הקולי.');

            // שלב 3: הפקת קובץ השמע
            const textToSpeak = `היי ${member.displayName}, שמעון בודק את מנוע הקול של ${engineToUse}.`;
            const audioBuffer = await (engineToUse === 'google'
                ? generateGoogleVoice(textToSpeak)
                : generateOpenAIVoice(textToSpeak));
            
            if (!audioBuffer || audioBuffer.length < 1024) {
                throw new Error('קובץ השמע שהתקבל ריק או פגום.');
            }

            // שלב 4: ניגון השמע
            log('[TTS_TESTER] מכין את הנגן ומנגן את השמע...');
            const audioResource = createAudioResource(Readable.from(audioBuffer));
            const player = createAudioPlayer();
            connection.subscribe(player);
            player.play(audioResource);
            log('[TTS_TESTER] ✅ הניגון התחיל.');

            player.on(AudioPlayerStatus.Idle, () => {
                log('[TTS_TESTER] הניגון הסתיים. מתנתק מהערוץ.');
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });
            player.on('error', error => {
                log.error(`[TTS_TESTER] ❌ שגיאה בנגן האודיו:`, error);
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            });

        } catch (error) {
            log.error(`[TTS_TESTER] ❌ שגיאה קריטית בתהליך הבדיקה:`, error);
            if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
        }
    }
  },
};