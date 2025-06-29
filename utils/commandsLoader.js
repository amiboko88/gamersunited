const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function registerSlashCommands(clientId) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  const slashCommands = [];

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command?.data && typeof command.data.toJSON === 'function') {
        slashCommands.push(command.data.toJSON());
      } else {
        console.warn(`⚠️ הפקודה בקובץ ${file} אינה תקינה – מדולגת.`);
      }
    } catch (err) {
      console.error(`❌ שגיאה בטעינת הקובץ ${file}:`, err.message);
    }
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

  try {
    console.log('🧼 מוחק את כל Slash Commands מהשרת...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );

    if (!slashCommands.length) {
      console.warn('⚠️ לא נמצאו פקודות חוקיות לרישום – הפעולה נעצרת.');
      return;
    }

    const registered = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: slashCommands }
    );

    console.log(`✅ ${registered.length} Slash Commands נרשמו מחדש.`);
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err.message);
  }
}

module.exports = {
  registerSlashCommands
};
