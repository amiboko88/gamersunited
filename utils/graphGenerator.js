// 📁 utils/graphGenerator.js
/**
 * Shimon Graphics Engine 2026
 * מנוע לייצור גרפים ויזואליים ללא צורך בספריות כבדות, באמצעות QuickChart API.
 */

/**
 * מייצר URL לגרף דונאט (Doughnut) המציג את פילוח הסטטוסים בשרת.
 * @param {Object} stats - אובייקט עם מספרי המשתמשים בכל קטגוריה.
 */
function generateStatusPieChart(stats) {
    // הגדרת הצבעים לפי חומרת המצב
    // ירוק (פעיל), צהוב (7+), כתום (14+), אדום (30+), אפור (חסום)
    const colors = [
        '#2ecc71', // Active
        '#f1c40f', // Warning
        '#e67e22', // Danger
        '#e74c3c', // Critical
        '#95a5a6'  // Failed
    ];

    const chartConfig = {
        type: 'doughnut',
        data: {
            labels: ['פעילים', 'רדומים (7+)', 'בסיכון (14+)', 'לניקוי (30+)', 'חסומים (DM)'],
            datasets: [{
                data: [
                    stats.active || 0, 
                    stats.inactive7Days || 0, 
                    stats.inactive14Days || 0, 
                    stats.inactive30Days || 0, 
                    stats.failedDM || 0
                ],
                backgroundColor: colors,
                borderColor: '#2b2d31', // צבע הרקע של דיסקורד (יוצר הפרדה יפה)
                borderWidth: 5
            }]
        },
        options: {
            plugins: {
                // רקע שקוף לגמרי
                legend: {
                    position: 'right',
                    labels: { 
                        color: '#ffffff', 
                        font: { size: 16, family: 'sans-serif' },
                        padding: 20
                    }
                },
                doughnutlabel: {
                    labels: [
                        {
                            text: `${stats.total}`,
                            font: { size: 40, weight: 'bold' },
                            color: '#ffffff'
                        },
                        {
                            text: 'משתמשים',
                            font: { size: 20 },
                            color: '#cccccc'
                        }
                    ]
                }
            }
        }
    };

    // המרת הקונפיגורציה ל-URL מקודד
    const jsonConfig = JSON.stringify(chartConfig);
    // שימוש ב-encodeURIComponent כדי שה-URL יהיה תקין
    return `https://quickchart.io/chart?c=${encodeURIComponent(jsonConfig)}&bkg=transparent&w=600&h=400&devicePixelRatio=2`;
}

module.exports = { generateStatusPieChart };