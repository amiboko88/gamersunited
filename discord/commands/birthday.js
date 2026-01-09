// 📁 discord/commands/birthday.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../../utils/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('🎂 אזור אישי: צפייה, עריכה וניהול ימי הולדת'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data() || {};
        
        // שליפת יום הולדת מהמבנה החדש והנקי
        const birthday = userData.identity?.birthday; // { day, month, year } or null

        // בדיקה האם המשתמש הוא מנהל
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        let embed, components;

        // תרחיש 1: למשתמש כבר יש יום הולדת מוגדר
        if (birthday) {
            embed = new EmbedBuilder()
                .setTitle('🎉 יום ההולדת שלך')
                .setDescription(`התאריך המעודכן אצלנו:\n# 📅 ${birthday.day}/${birthday.month}/${birthday.year || '????'}`)
                .setColor('Green')
                .setFooter({ text: 'רוצה לשנות? לחץ על עריכה.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_bd_edit')
                    .setLabel('עריכת תאריך')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✏️')
            );

            // אם הוא מנהל, נוסיף לו את כפתור הניהול
            if (isAdmin) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_bd_admin_panel')
                        .setLabel('פאנל ניהול (Admin)')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🛡️')
                );
            }
            components = [row];

        } 
        // תרחיש 2: אין יום הולדת
        else {
            embed = new EmbedBuilder()
                .setTitle('🎂 מתי חוגגים לך?')
                .setDescription('עדיין לא עדכנת את תאריך יום ההולדת שלך בשמעון.\nעדכן עכשיו כדי שנוכל לחגוג לך כמו שצריך!')
                .setColor('Yellow');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_bd_set')
                    .setLabel('הגדר יום הולדת')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
            );
            
            if (isAdmin) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_bd_admin_panel')
                        .setLabel('פאנל ניהול')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🛡️')
                );
            }
            components = [row];
        }

        await interaction.editReply({ embeds: [embed], components: components });
    }
};