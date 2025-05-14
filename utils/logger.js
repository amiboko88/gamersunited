const { WebhookClient } = require('discord.js');

const webhookUrl = process.env.LOG_WEBHOOK_URL;
const webhook = webhookUrl ? new WebhookClient({ url: webhookUrl }) : null;

function log(message) {
  console.log(message);
  if (webhook) {
    webhook.send({ content: `📢 ${message}` }).catch(() => {});
  }
}

module.exports = { log };