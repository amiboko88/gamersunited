// 📁 utils/graphGenerator.js
const { createCanvas } = require('canvas');

module.exports = {
    /**
     * מייצר גרף עוגה (Pie Chart) פשוט עבור סטטוס משתמשים
     * @param {Object} data - אובייקט עם הנתונים (active, warning, inactive)
     * @returns {Buffer} תמונה
     */
    async generateStatusChart(data) {
        const width = 800;
        const height = 500;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // רקע
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(0, 0, width, height);

        // כותרת
        ctx.font = 'bold 40px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('סטטוס פעילות משתמשים', width / 2, 60);

        // נתונים
        const total = data.active + data.warning + data.inactive;
        const slices = [
            { label: 'פעילים', value: data.active, color: '#2ecc71' },
            { label: 'בסיכון', value: data.warning, color: '#f1c40f' },
            { label: 'לא פעילים', value: data.inactive, color: '#e74c3c' }
        ];

        let startAngle = 0;
        const centerX = 300;
        const centerY = 280;
        const radius = 150;

        // ציור העוגה
        slices.forEach(slice => {
            if (slice.value === 0) return;
            
            const sliceAngle = (slice.value / total) * 2 * Math.PI;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            
            ctx.fillStyle = slice.color;
            ctx.fill();
            
            startAngle += sliceAngle;
        });

        // מקרא (Legend)
        let legendY = 200;
        const legendX = 550;
        
        ctx.textAlign = 'left';
        ctx.font = '30px sans-serif';

        slices.forEach(slice => {
            // ריבוע צבע
            ctx.fillStyle = slice.color;
            ctx.fillRect(legendX, legendY, 30, 30);
            
            // טקסט
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${slice.label}: ${slice.value}`, legendX + 45, legendY + 25);
            
            legendY += 50;
        });

        // סיכום
        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#99aab5';
        ctx.textAlign = 'center';
        ctx.fillText(`סה"כ נבדקו: ${total}`, width / 2, height - 30);

        return canvas.toBuffer();
    }
};