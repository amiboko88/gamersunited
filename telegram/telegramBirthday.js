// 📁 telegram/telegramBirthday.js
const { InlineKeyboard } = require("grammy");
const db = require("../utils/firebase");
const { getUserRef } = require("../utils/userUtils"); 

function validateBirthday(input) {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [_, day, month, year] = match.map(Number);
  const now = new Date();
  const age = now.getFullYear() - year;
  
  // בדיקות שפיות
  if (age < 10 || age > 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  
  return { day, month, year, age };
}

async function saveBirthday(user, bday) {
  try {
      // שימוש ב-getUserRef עם פלטפורמת 'telegram' כדי למצוא את המשתמש הנכון (או לקשר אותו)
      const userRef = await getUserRef(user.id.toString(), 'telegram');
      
      await userRef.set({
        identity: {
            birthday: {
                day: bday.day,
                month: bday.month,
                year: bday.year,
                age: bday.age
            },
            // מעדכנים שם על הדרך, שיהיה מעודכן
            fullName: user.first_name + (user.last_name ? ` ${user.last_name}` : ""),
            telegramUsername: user.username || null
        },
        platforms: {
            telegram: user.id.toString()
        },
        tracking: {
            birthdayUpdated: new Date().toISOString()
        }
      }, { merge: true });

      return true;
  } catch (error) {
      console.error("❌ Error saving telegram birthday:", error);
      return false;
  }
}

function registerBirthdayHandler(bot, WAITING_USERS) {
  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from.id;
    
    if (WAITING_USERS.get(userId) === "add_birthday") {
      const text = ctx.message.text.trim();
      const bday = validateBirthday(text);

      if (!bday) {
        return ctx.reply("❌ תאריך לא תקין. נסה שוב בפורמט: DD.MM.YYYY (למשל 14.05.1990)");
      }

      const success = await saveBirthday(ctx.from, bday);
      if (success) {
          await ctx.reply(`✅ מעולה! רשמתי לך יום הולדת בתאריך <b>${bday.day}.${bday.month}.${bday.year}</b>.`, { parse_mode: "HTML" });
      } else {
          await ctx.reply("❌ אירעה שגיאה בשמירת התאריך.");
      }
      
      WAITING_USERS.delete(userId);
      return; 
    }
    
    await next();
  });
}

module.exports = { registerBirthdayHandler, validateBirthday, saveBirthday };