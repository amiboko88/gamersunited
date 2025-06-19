// 📁 handlers/dmEcho.js
module.exports = function initDmEcho(client) {
  client.on('messageCreate', async message => {
    if (!message.guild && !message.author.bot) {
      console.log('✅ [DM-ECHO] הודעה פרטית מ־', message.author.tag, '| תוכן:', message.content);
      try {
        await message.reply('✅ שמעון שומע אותך!');
      } catch (err) {
        console.error('❌ שגיאה בשליחת תגובה:', err.message);
      }
    }
  });
};
