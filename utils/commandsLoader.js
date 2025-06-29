// 📁 utils/commandsLoader.js

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function registerSlashCommands(clientId) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  console.log(`📁 סורק ${commandFiles.length} פקודות מתוך /commands:`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

  let count = 0;

  for (const file of commandFiles) {
    const fullPath = path.join(commandsPath, file);

    try {
      const command = require(fullPath);

      if (!command?.data || typeof command.data.toJSON !== 'function') {
        console.warn(`⚠️ ${file} אינו מכיל data תקין – מדולג.`);
        continue;
      }

      const json = command.data.toJSON();

      await rest.post(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: json }
      );

      console.log(`✅ ${file} נרשמה כפקודת Slash`);
      count++;

    } catch (err) {
      console.error(`❌ שגיאה ברישום ${file}:`, err.message);
    }
  }

  if (count === 0) {
    console.warn('⚠️ לא נרשמה אף פקודה.');
  } else {
    console.log(`🎉 נרשמו ${count} פקודות בהצלחה לשרת ${guildId}`);
  }
}

module.exports = {
  registerSlashCommands
};
