// 📁 handlers/podcastManager.js
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const profiles = require('../data/profiles.js');
const voiceQueue = require('./voiceQueue.js');

const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

let activePodcastChannelId = null; 
let podcastCooldown = false;
const spokenUsers = new Set();

function initializePodcastState() {
    activePodcastChannelId = null;
    podcastCooldown = false;
    spokenUsers.clear();
    log('[PODCAST] מנהל הפודקאסט אותחל.');
}

function getPodcastStatus() { return !!activePodcastChannelId; }

async function handleVoiceStateUpdate(oldState, newState) {
    const { channel: newChannel, client, member, guild } = newState;
    const { channelId: oldChannelId } = oldState;

    if (oldChannelId === newChannel?.id) return false; 

    if (oldChannelId && oldChannelId === activePodcastChannelId) {
        const oldChannel = guild.channels.cache.get(oldChannelId);
        if (oldChannel) {
            const members = oldChannel.members.filter(m => !m.user.bot);
            if (members.size < MIN_USERS_FOR_PODCAST) {
                log(`[PODCAST] מספר המשתמשים בערוץ ${oldChannel.name} ירד מתחת ל-${MIN_USERS_FOR_PODCAST}. מסיים את הפודקאסט.`);
                activePodcastChannelId = null;
                spokenUsers.clear();
                podcastCooldown = true;
                setTimeout(() => { podcastCooldown = false; log('[PODCAST] תקופת הצינון הסתיימה.'); }, PODCAST_COOLDOWN);
            }
        }
    }

    if (newChannel) {
        const TEST_CHANNEL_ID = '1396779274173943828';
        if (newChannel.id === TEST_CHANNEL_ID) return false;

        const members = newChannel.members.filter(m => !m.user.bot);
        const isPodcastActiveInThisChannel = newChannel.id === activePodcastChannelId;
        
        const shouldStart = members.size >= MIN_USERS_FOR_PODCAST && !getPodcastStatus() && !podcastCooldown;
        const shouldAnnounce = isPodcastActiveInThisChannel && !spokenUsers.has(member.id);

        if (shouldStart || shouldAnnounce) {
            if (shouldStart) {
                log(`[PODCAST] התנאים התקיימו בערוץ ${newChannel.name} (${members.size} משתמשים). מתחיל פודקאסט.`);
                activePodcastChannelId = newChannel.id; 
                spokenUsers.clear();
            }
            
            spokenUsers.add(member.id);
            await playPersonalPodcast(newChannel, member, client);
            return true; 
        }
    }
    
    return false; 
}

async function playPersonalPodcast(channel, member, client) {
    const { id: userId, displayName: userName } = member;
    
    // ✅ [שדרוג] שימוש ב-default כגיבוי ראשי
    let userProfileLines = profiles.playerProfiles[userId];
    let source = 'פרופיל אישי';

    if (!userProfileLines || userProfileLines.length === 0) {
        userProfileLines = profiles.playerProfiles.default;
        source = 'פרופיל דיפולטיבי';
    }

    if (!userProfileLines || userProfileLines.length === 0) {
        log(`[PODCAST] ⚠️ לא נמצאו שורות טקסט (גם לא ב-default). מדלג.`);
        return;
    }

    log(`[PODCAST] מכין פודקאסט עבור ${userName} (מקור: ${source})`);

    // בחירת 3 משפטים רנדומליים
    const selectedLines = [...userProfileLines].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    // ✅ [שדרוג] החלפת {userName} בשם המשתמש האמיתי בכל השורות
    // ובניית הסקריפט (שמעון -> שירלי -> שמעון)
    let script = [];
    if (selectedLines[0]) script.push({ speaker: 'shimon', text: selectedLines[0].replace(/{userName}/g, userName) });
    if (selectedLines[1]) script.push({ speaker: 'shirly', text: selectedLines[1].replace(/{userName}/g, userName) });
    if (selectedLines[2]) script.push({ speaker: 'shimon', text: selectedLines[2].replace(/{userName}/g, userName) });

    const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
    
    if (audioBuffers.length > 0) {
        log(`[PODCAST] מעביר ${audioBuffers.length} קטעי שמע לתור הניגון.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client, 'PODCAST');
        }
    } else {
        log('[PODCAST] ⚠️ ttsEngine החזיר 0 קטעי אודיו.');
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    getPodcastStatus,
    restrictedCommands,
    playPersonalPodcast 
};