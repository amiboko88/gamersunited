// 📁 utils/commandsLoader.js

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
    const response = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: slashCommands }
    );
    console.log(`✅ Slash Commands עודכנו (${response.length} פקודות)`);
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }
}

module.exports = {
  registerSlashCommands
};
