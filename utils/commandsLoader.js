const fs = require('fs');
const path = require('path');
// לא טוענים בכלל את REST ו־Routes
// const { REST, Routes } = require('discord.js');

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

  // ביטול מוחלט של הרישום בפועל
  console.warn('🚧 רישום Slash Commands מבוטל זמנית לצורך איתור תקלה. הפקודות לא יירשמו.');
}

module.exports = {
  registerSlashCommands
};
