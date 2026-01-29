const { getUserRef } = require('../../utils/userUtils');
const { log } = require('../../utils/logger');
const graphics = require('../graphics/index');
const { economy } = require('../../config/settings');
const { getSocket } = require('../../whatsapp/socket');
const voiceManager = require('../media/voice'); // ✅ Switch to Working Voice Engine (Media)
const waStore = require('../../whatsapp/store'); // ✅ Store for ID resolution
const shimonBrain = require('../ai/brain');
const learningEngine = require('../ai/learning');
const fs = require('fs');
const path = require('path');

const LEVEL_FORMULA = level => economy.levelMultiplier * (level ** 2) + economy.levelLinear * level + economy.levelBase;
const lastMessageTimestamps = new Map();

class XPManager {

    async handleXP(userId, platform, content, contextObj, replyFunc) {
        if (!content || !userId) return;
        if (userId.length < 16 && platform !== 'discord') return; // Basic validation

        const now = Date.now();
        const cooldownKey = `${platform}-${userId}`;

        if (lastMessageTimestamps.has(cooldownKey)) {
            const last = lastMessageTimestamps.get(cooldownKey);
            if ((now - last) / 1000 < economy.xpCooldown) return;
        }
        lastMessageTimestamps.set(cooldownKey, now);

        const charCount = content.length;
        const xpGain = Math.min(Math.floor(charCount / economy.charsPerXp) + economy.minXpPerMsg, economy.maxXpPerMsg);

        try {
            const userRef = await getUserRef(userId, platform);

            await userRef.firestore.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                if (!doc.exists) return;

                const data = doc.data();
                let { xp, level, balance } = data.economy || { xp: 0, level: 1, balance: 0 };
                xp += xpGain;

                const nextLevelXp = LEVEL_FORMULA(level);
                let leveledUp = false;

                while (xp >= nextLevelXp) {
                    xp -= nextLevelXp;
                    level++;
                    leveledUp = true;
                }

                const updates = {
                    'economy.xp': xp,
                    'economy.level': level,
                    'stats.messagesSent': (data.stats?.messagesSent || 0) + 1,
                    'meta.lastActive': new Date().toISOString()
                };

                // 💰 Reward: 100 Coins for Level Up
                if (leveledUp) {
                    balance = (balance || 0) + 100;
                    updates['economy.balance'] = balance;
                }

                t.update(userRef, updates);

                // --- Level Up Trigger ---
                if (leveledUp) {
                    log(`[XP] 🆙 ${userId} (${platform}) leveled up to ${level}. Reward: 100 Coins.`);

                    // Allow transaction to complete before IO operations
                    setTimeout(async () => {
                        await this.processLevelUpEvent(userId, platform, level, xp, data, contextObj, replyFunc);
                    }, 100);
                }
            });
        } catch (error) {
            console.error(`[XP] Error processing for ${userId}:`, error.message);
        }
    }

    calculateRank(level) {
        if (level >= 50) return { name: "PREDATOR", color: "linear-gradient(90deg, #ff0000, #ff3300)" }; // Red
        if (level >= 30) return { name: "PLATINUM", color: "linear-gradient(90deg, #00ced1, #008b8b)" }; // Teal/Cyan
        if (level >= 15) return { name: "GOLD", color: "linear-gradient(90deg, #ffd700, #ffa500)" };     // Gold
        if (level >= 5) return { name: "SILVER", color: "linear-gradient(90deg, #c0c0c0, #a9a9a9)" };   // Silver
        return { name: "ROOKIE", color: "linear-gradient(90deg, #cd7f32, #8b4513)" };                    // Bronze
    }

    async processLevelUpEvent(userId, platform, level, xp, userData, contextObj, replyFunc) {
        try {
            const name = userData.identity?.displayName || "Gamer";

            // --- 1. Dual Identity Logic (Avatar Split) ---
            let avatar = userData.identity?.avatarURL; // Default valid one

            // Ensure we have specific avatars
            let waAvatar = userData.identity?.avatar_whatsapp;
            let discordAvatar = userData.identity?.avatar_discord;

            const sock = getSocket();
            const waLid = userData.platforms?.whatsapp_lid || userData.identity?.whatsapp_lid;
            const discordId = userData.identity?.discordId;

            // Strategy: Check Platform Specific First -> Then Fallback -> Then Fetch New
            if (platform === 'whatsapp') {
                // Try fetching fresh WA avatar if missing or default
                if ((!waAvatar || waAvatar.includes('embed/avatars')) && waLid && sock) {
                    try {
                        const ppUrl = await sock.profilePictureUrl(waLid, 'image').catch(() => null);
                        if (ppUrl) {
                            waAvatar = ppUrl;
                            // Persist async
                            const userRef = await getUserRef(userId, platform);
                            userRef.update({ 'identity.avatar_whatsapp': ppUrl, 'identity.avatarURL': ppUrl });
                        }
                    } catch (e) { }
                }
                avatar = waAvatar || avatar;
            } else if (platform === 'discord') {
                avatar = discordAvatar || avatar;
            }

            // Fallback
            if (!avatar || avatar.includes('embed/avatars')) {
                avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
            }

            // --- 2. Generate Graphic Card ---
            const rank = this.calculateRank(level);
            const cardBuffer = await graphics.profile.generateLevelUpCard(name, level, xp, avatar, rank.name, rank.color);

            if (platform === 'whatsapp' && contextObj.sock && contextObj.chatId) {
                // A. Send Image with Caption (Smart Mentions)
                // The goal is to avoid displaying the ugly LID (429...) in the text.

                let displayTag = "";
                const mentions = [userId]; // Always mention the target ID (LID or Phone) so they get notified

                // Try to find a clean phone number for the visual tag
                let phoneJid = waStore.getPhoneById(userId);

                // If the userId itself looks like a phone number (not LID), use it
                if (!phoneJid && !userId.includes('lid') && userId.includes('@s.whatsapp.net')) {
                    phoneJid = userId;
                }

                if (phoneJid) {
                    // We have a phone number! Use it for the pretty tag
                    const cleanPhone = phoneJid.split('@')[0];
                    displayTag = `@${cleanPhone}`;
                    mentions.push(phoneJid); // Add phone JID to mentions just in case
                } else {
                    // We only have a LID and couldn't resolve the phone. 
                    // Fallback: Use the Name text instead of an ugly number tag.
                    displayTag = `*${name}*`;
                }

                await contextObj.sock.sendMessage(contextObj.chatId, {
                    image: cardBuffer,
                    caption: `🎉 *LEVEL UP!* \nמזל טוב ${displayTag} עלית לרמה *${level}* (${rank.name})!\n💰 קיבלת 100₪ מתנה לחשבון.`,
                    mentions: mentions
                });

                // B. Generate Shimon Roast Voice Note 🎙️
                try {
                    const factsContext = await learningEngine.getUserProfile(userId, platform);
                    const prompt = `
                    Generate a SHORT Hebrew Voice Message text from Shimon to ${name}.
                    Context: They just reached Level ${level} (${rank.name}). You gave them 100 shekels.
                    Tone: Cynical, "Ars" (Israeli slang), funny, roasting but congratulating.
                    User Facts: ${factsContext}
                    
                    Message Structure:
                    "Congratulations [Roast about specific fact]. You reached level ${level}. I sent 100 shekels to your bank. Don't waste it on [Roast]."
                    Keep it under 20 words.
                    `;

                    const script = await shimonBrain.generateInternal(prompt);
                    if (script) {
                        // User Media Voice Engine (Hardcoded ID)
                        const audioBuffer = await voiceManager.textToSpeech(script);
                        if (audioBuffer) {
                            // 🔄 Convert to OGG Opus for Android Compatibility
                            const converter = require('../media/converter');
                            const oggBuffer = await converter.convertToOgg(audioBuffer);

                            await contextObj.sock.sendMessage(contextObj.chatId, {
                                audio: oggBuffer,
                                mimetype: 'audio/ogg; codecs=opus', // ✅ Verified Android Fix
                                ptt: true
                            });
                        }
                    }
                } catch (voiceError) {
                    log(`[XP] Voice Generation Failed: ${voiceError.message}`);
                }

            } else {

                // Discord Fallback
                if (replyFunc) await replyFunc(`🎉 **LEVEL UP!** ${name} -> Level ${level} (${rank.name}) (+100 Coins 💰)`);
            }

        } catch (error) {
            log(`[XP] Level Up Process Error: ${error.message}`);
        }
    }
}

module.exports = new XPManager();