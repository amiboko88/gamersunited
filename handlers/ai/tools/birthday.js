// 📁 handlers/ai/tools/birthday.js
const birthdayManager = require('../../birthday/manager');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "manage_birthday",
            description: "Register or check user birthday.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["register", "check"] },
                    day: { type: "integer" },
                    month: { type: "integer" },
                    year: { type: "integer" }
                },
                required: ["action"]
            }
        }
    },

    async execute(args, userId) {
        if (args.action === 'register') {
            if (!args.day || !args.month) return "חסר לי יום או חודש.";
            
            // השלמת שנה אוטומטית אם חסרה (כמו בלוגיקה הישנה)
            let year = args.year || new Date().getFullYear();
            if (year < 100) year += 2000;

            try {
                const res = await birthdayManager.registerUser(userId, 'whatsapp', args.day, args.month, year);
                return `✅ נרשם בהצלחה! יום הולדת ב-${res.day}/${res.month}. נחגוג לך בגיל ${res.age}.`;
            } catch (e) {
                return `שגיאה ברישום: ${e.message}`;
            }
        }

        if (args.action === 'check') {
            // כאן אפשר להוסיף לוגיקה לבדיקת יום הולדת אם רוצים
            return "תבדוק בפקודה /birthday, אני לא זוכר בעל פה.";
        }
    }
};