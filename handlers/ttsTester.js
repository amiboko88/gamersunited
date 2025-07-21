// 📁 handlers/ttsTester.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const { getLineForUser } = require('../data/fifoLines');
const { log } = require('../utils/logger');
const { sendStaffLog } = require('../utils/staffLogger');
const { Readable } = require('stream');

const TEST_CHANNEL_ID = '1396779274173943828';
let isTestRunning = false;

/**
 * מפעיל בדיקה מלאה של מערכת ה-TTS על משתמש בערוץ הבדיקות.
 * @param {import('discord.js').GuildMember} member - המשתמש שהפעיל את הבדיקה.
 */
async function runTTSTest(member) {
    if (isTestRunning) {
        log('[TTS_TEST] בדיקה כבר רצה, מדלג על הפעלה כפולה.');
        return;
    }

    isTestRunning = true;
    const { channel } = member.voice;
    const client = member.client;
    log(`[TTS_TEST] התחלת בדיקת TTS עבור ${member.displayName} בערוץ ${channel.name}`);
    await sendStaffLog(client, '🧪 התחלת בדיקת TTS', `הופעלה בדיקה ידנית על ידי <@${member.id}>.`, 0x3498db);

    let connection;
    try {
        // 1. התחברות לערוץ
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 10000);
        log('[TTS_TEST] התחברות לערוץ הצליחה.');

        // 2. בחירת טקסט וקריאה ל-ElevenLabs
        const textToSpeak = getLineForUser(member.id, member.displayName);
        log(`[TTS_TEST] טקסט לבדיקה: "${textToSpeak}"`);
        const audioBuffer = await synthesizeElevenTTS(textToSpeak, 'shimon');
        log('[TTS_TEST] קובץ שמע נוצר בהצלחה מ-ElevenLabs.');

        // 3. ניגון השמע
        const player = createAudioPlayer();
        connection.subscribe(player);
        const resource = createAudioResource(Readable.from(audioBuffer), { inputType: StreamType.Arbitrary });
        player.play(resource);
        
        await entersState(player, AudioPlayerStatus.Playing, 5000);
        log('[TTS_TEST] ניגון השמע החל.');
        await entersState(player, AudioPlayerStatus.Idle, 20000);
        log('[TTS_TEST] ניגון השמע הסתיים.');

        await sendStaffLog(client, '✅ בדיקת TTS הסתיימה בהצלחה', `הבדיקה שהופעלה על ידי <@${member.id}> עברה בהצלחה.`, 0x2ecc71);

    } catch (error) {
        console.error('❌ שגיאה קריטית בבדיקת TTS:', error);
        await sendStaffLog(client, '❌ בדיקת TTS נכשלה', `אירעה שגיאה בבדיקה: \`\`\`${error.message}\`\`\``, 0xe74c3c);
    } finally {
        // 4. ניתוק וניקוי
        if (connection) {
            try {
                connection.destroy();
                log('[TTS_TEST] החיבור הקולי נותק.');
            } catch (e) {
                console.error('[TTS_TEST] שגיאה בניתוק החיבור:', e.message);
            }
        }
        isTestRunning = false;
        log('[TTS_TEST] תהליך הבדיקה הסתיים.');
    }
}

module.exports = {
    runTTSTest,
    TEST_CHANNEL_ID
};