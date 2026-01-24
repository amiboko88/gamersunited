const core = require('./core');

// Premium Welcome Card Generator
async function generateWelcomeCard(username, userAvatarUrl, groupName = "GAMERS UNITED") {
    // Fallback Avatar if null
    const avatar = userAvatarUrl || "https://i.imgur.com/XF8h7gV.png"; // Default Gamer Icon

    // Clean phone number if username is a phone
    const displayName = username.replace('@s.whatsapp.net', '');

    const width = 1000;
    const height = 500;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;600;900&display=swap');
            
            body { 
                margin: 0; padding: 0; width: ${width}px; height: ${height}px;
                background: #09090b;
                background-image: 
                    linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.9)),
                    url('https://i.imgur.com/8J5b2eL.jpeg'); /* Cool Gamer Background */
                background-size: cover;
                background-position: center;
                font-family: 'Outfit', sans-serif;
                color: white;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                overflow: hidden;
            }

            .card {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 30px;
                padding: 40px 80px;
                display: flex; flex-direction: column; align-items: center;
                gap: 20px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                width: 80%;
                text-align: center;
            }

            .avatar-container {
                position: relative;
            }

            .avatar {
                width: 150px; height: 150px;
                border-radius: 50%;
                border: 6px solid #fbbf24;
                object-fit: cover;
                box-shadow: 0 0 30px rgba(251, 191, 36, 0.4);
            }

            .badge {
                position: absolute; bottom: 5px; right: 5px;
                background: #ef4444; color: white;
                padding: 5px 15px; border-radius: 20px;
                font-weight: bold; font-size: 14px;
                border: 3px solid #09090b;
            }

            h1 {
                margin: 0;
                font-size: 60px;
                font-weight: 900;
                background: linear-gradient(to right, #ffffff, #fbbf24);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-transform: uppercase;
                letter-spacing: -2px;
                text-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }

            p {
                margin: 0;
                font-size: 24px;
                color: #94a3b8;
                font-weight: 600;
                letter-spacing: 2px;
                text-transform: uppercase;
            }

            .footer {
                margin-top: 20px;
                font-size: 16px;
                color: #475569;
                font-weight: bold;
            }
            
            .highlight { color: #fbbf24; }

        </style>
    </head>
    <body>
        <div class="card">
            <div class="avatar-container">
                <img src="${avatar}" class="avatar" />
                <div class="badge">NEW</div>
            </div>
            
            <div>
                <p>Welcome to the Squad</p>
                <h1>${displayName}</h1>
                <p class="highlight">${groupName}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return core.render(html, width, height);
}

module.exports = { generateWelcomeCard };
