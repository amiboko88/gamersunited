const { EmbedBuilder } = require('discord.js');
const { votes, weeklySchedule, buildDesc, buildButtons, ROLE_ID } = require('../commands/activityBoard');

module.exports = async function handleRSVP(interaction, client) {
  if (interaction.customId.startsWith('vote_')) {
    const id = interaction.customId.replace('vote_', '');
    const voterId = interaction.user.id;
    const alreadyVoted = votes[id].has(voterId);

    // אפשר לאפשר גם "הסרה" (ביטול הצבעה)
    if (alreadyVoted) {
      votes[id].delete(voterId);
    } else {
      votes[id].add(voterId);

      // מחלק Role אם תרצה (בדוק שיש הרשאה)
      if (ROLE_ID) {
        try {
          const member = await interaction.guild.members.fetch(voterId);
          await member.roles.add(ROLE_ID);
        } catch (e) { /* אפשר להדפיס לוג */ }
      }
    }

    // עדכון Embed בלייב — איתור ההודעה ועריכה
    const channel = interaction.channel;
    let msg;
    try {
      msg = await channel.messages.fetch(interaction.message.id);
    } catch (e) {}

    if (msg) {
      // בנה Embed וכפתורים מעודכנים
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setDescription(buildDesc())
        .setTimestamp(new Date());
      await msg.edit({
        embeds: [embed],
        components: buildButtons(voterId)
      });
    }

    // שלח תגובה עם GIF/הודעה מצחיקה/אימוג'י
    const funnyLines = [
      '🔥 אתה נכנס לליגת האלופים!',
      '💣 שימחת אותנו, קבל באדג\' למצטיינים!',
      '🍕 מובטח פיצה למי שמגיע ראשון!',
      '🎁 אולי הפעם תנצח משהו אמיתי!',
      '🎮 תיזהר — שמעון עוקב אחרי הנוכחות!'
    ];
    const funnyLine = funnyLines[Math.floor(Math.random() * funnyLines.length)];

    await interaction.reply({
      content: `${weeklySchedule.find(e => e.id === id).emoji} ${funnyLine} ${alreadyVoted ? '❌ ביטלת הצבעה' : '✅ נספרת להצבעה!'}\n*רוצה תוצאה? לחץ שוב להצגת מצב עדכני*`,
      ephemeral: true
    });

  } else if (interaction.customId === 'show_stats') {
    // סטטיסטיקה כללית — Embed קצר
    const stats = weeklySchedule.map(e => `${e.emoji} **${e.day}:** \`${votes[e.id].size} מצביעים\``).join('\n');
    await interaction.reply({
      content: `📊 **סטטיסטיקה מעודכנת:**\n${stats}`,
      ephemeral: true
    });
  }
};
