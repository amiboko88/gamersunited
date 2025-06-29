const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function registerSlashCommands(clientId) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  const slashCommands = [];

  console.log(`📁 התחלת טעינה של ${commandFiles.length} פקודות:`);

  for (const file of commandFiles) {
    try {
      const fullPath = path.join(commandsPath, file);
      const command = require(fullPath);

      if (command?.data && typeof command.data.toJSON === 'function') {
        const json = command.data.toJSON();
        slashCommands.push(json);
        console.log(`✅ ${file} נרשמה כפקודת Slash`);
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

    if (!slashCommands.length) {
      console.warn('⚠️ לא נמצאו פקודות חוקיות לרישום – הפעולה נעצרת.');
      return;
    }

    console.log(`📤 JSON שנשלח לרישום:`);
    console.dir(slashCommands, { depth: null });

    console.log(`🚀 רושם ${slashCommands.length} פקודות חדשות ל־Guild ${guildId}...`);
    const registered = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: slashCommands }
    );

    console.log(`✅ ${registered.length} Slash Commands נרשמו בהצלחה.`);
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err.message);
  }
}

module.exports = {
  registerSlashCommands
};
