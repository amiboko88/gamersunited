// 📁 discord/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const voiceLogistics = require('../../handlers/voice/logistics');
const podcastManager = require('../../handlers/voice/podcast');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const guild = newState.guild;
        const client = newState.client;

        // 1. עדכון המונה הדינמי (In Voice: X) וניקוי חדרים
        await voiceLogistics.updateVoiceIndicator(guild);

        // 2. כרוז BF6 (רק כשמישהו נכנס פיזית לחדר ה-BF6)
        if (!oldState.channelId && newState.channelId === '1403121794235240489') {
            await voiceLogistics.handleBF6Announcer(newState.member, newState.channelId);
        }

        // 3. מנוע הפודקאסטים (בדיקה האם להתחיל שידור ירידות)
        await podcastManager.handleVoiceStateUpdate(oldState, newState);
    }
};