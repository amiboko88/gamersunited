const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function registerSlashCommands(clientId) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  const slashCommands = [];

  console.log(`📁 סורק ${commandFiles.length} פקודות מתוך /commands:`);

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command?.data && typeof command.data.toJSON === 'function') {
        slashCommands.push(command.data.toJSON());
        console.log(`✅ ${file} נטענה כפקודת Slash`);
      } else {
        console.warn(`⚠️ הפקודה בקובץ ${file} אינה תקינה – מדולגת.`);
      }
    } catch (err) {
      console.error(`❌ שגיאה בטעינת הפקודה ${file}:`, err.message);
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

    console.log(`📤 מתחיל רישום אישי של ${slashCommands.length} פקודות:`);

    for (const cmd of slashCommands) {
      try {
        console.log(`🔍 מנסה לרשום את הפקודה: ${cmd.name}`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: [cmd] }
        );
        console.log(`✅ ${cmd.name} נרשמה בהצלחה.`);
      } catch (err) {
        console.error(`❌ שגיאה ברישום ${cmd.name}:`, err.message);
      }
    }

    console.log('🎯 סיום תהליך הרישום האישי.');
  } catch (err) {
    console.error('❌ שגיאה כוללת ברישום Slash Commands:', err);
  }
}

module.exports = {
  registerSlashCommands
};
