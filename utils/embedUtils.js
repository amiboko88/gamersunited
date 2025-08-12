// 📁 utils/embedUtils.js

/**
 * פונקציית עזר לבניית שדות מרובי עמודים עבור Embeds, בהתחשב במגבלות דיסקורד.
 * כל שדה יכול להכיל עד 1024 תווים.
 * @param {string} title - כותרת השדה.
 * @param {string[]} items - מערך של מחרוזות (שורות) להצגה בשדה.
 * @returns {Array<Object>} - מערך של אובייקטי שדות ל-Embed.
 */
function createPaginatedFields(title, items) {
    const fields = [];
    let currentContent = '';
    let pageNum = 1;
    const MAX_FIELD_LENGTH = 1024; // מגבלת תווים לשדה ב-Embed

    if (items.length === 0) {
        fields.push({ name: title, value: '— אין נתונים זמינים —', inline: false });
        return fields;
    }

    for (const item of items) {
        // +1 עבור תו ירידת שורה
        if (currentContent.length + item.length + 1 > MAX_FIELD_LENGTH) {
            fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
            currentContent = item;
            pageNum++;
        } else {
            currentContent += (currentContent ? '\n' : '') + item;
        }
    }

    if (currentContent) {
        fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
    }

    return fields;
}

module.exports = {
    createPaginatedFields,
};