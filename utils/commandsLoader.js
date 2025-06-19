const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function registerSlashCommands(clientId) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  const slashCommands = [];

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command?.data && typeof command.data.toJSON === 'function') {
      slashCommands.push(command.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

  try {
    // 🧼 מחיקת כל הפקודות הקיימות (Guild)
    console.log('🧼 מוחק את כל Slash Commands מהשרת...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );

    // 🧼 מחיקת כל הפקודות הגלובליות
    console.log('🧼 מוחק את כל Slash Commands הגלובליים...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );

    // 📥 רישום מחדש לפי תיקיית commands בלבד
    const registered = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: slashCommands }
    );

    console.log(`✅ ${registered.length} Slash Commands נרשמו מחדש מהתיקייה.`);
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }
}

module.exports = {
  registerSlashCommands
};
