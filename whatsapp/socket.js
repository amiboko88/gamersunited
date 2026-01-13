// 📁 whatsapp/socket.js
let sock = null;

function setSocket(s) {
    sock = s;
}

function getSocket() {
    return sock;
}

module.exports = { setSocket, getSocket };
