// 📁 handlers/ai/tools/identity.js
const db = require('../../../utils/firebase');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "update_user_info",
            description: "Update user profile (birthday, name) in DB.",
            parameters: {
                type: "object",
                properties: {
                    birth_day: { type: "integer" },
                    birth_month: { type: "integer" },
                    full_name: { type: "string" }
                }
            }
        }
    },

    async execute(args, userId) {
        const updates = {};
        let feedback = "";

        if (args.birth_day && args.birth_month) {
            updates['identity.birthday'] = { day: args.birth_day, month: args.birth_month };
            feedback += `יום הולדת עודכן (${args.birth_day}/${args.birth_month}). `;
        }
        if (args.full_name) {
            updates['identity.fullName'] = args.full_name;
            feedback += `שם עודכן. `;
        }

        if (Object.keys(updates).length > 0) {
            await db.collection('users').doc(userId).set(updates, { merge: true });
            return feedback || "עודכן.";
        }
        return "לא סופק מידע לשינוי.";
    }
};