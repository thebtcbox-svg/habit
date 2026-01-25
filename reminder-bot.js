import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const directusUrl = process.env.VITE_DIRECTUS_URL || 'https://directus-production-8063.up.railway.app';
const directusToken = process.env.VITE_DIRECTUS_TOKEN || 'e8_Dvaln7O6vTobil6uBOzO74GsSJ_2i';
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '8047939266:AAGWTytDQMPEio9jWP8KYpBZjZaqO0jlLM8';
const PORT = process.env.PORT || process.env.API_PORT || 3001;

const BOT_TRANSLATIONS = {
  en: {
    welcome: `Welcome! 🌟\n\nSuccess is built one habit at a time. We believe that focusing your energy on <b>one primary habit</b> while tracking your supporting ones is the secret to long-term growth.\n\nTap the <b>blue button</b> 📱 on the bottom left to open your tracker and start building your future!\n\n📌 <b>Tip:</b> Pin this bot to your chat list to stay consistent and never lose sight of your goals.`,
    reminder: `Hey {{username}}! 🌟 Don't forget to log your habits today and keep your streak alive!`,
    support_thanks: `Thank you for your support of {{amount}} Stars! 🌟 You've been rewarded with {{xp}} XP bonus! Keep crushing those habits!`,
    invoice_title: "Support Habit Tracker",
    invoice_desc: "Support the development with {{amount}} Telegram Stars 🌟"
  },
  ru: {
    welcome: `Добро пожаловать! 🌟\n\nУспех строится на привычках. Мы верим, что фокус на <b>одной главной привычке</b> и отслеживание дополнительных — это секрет долгосрочного роста.\n\nНажмите <b>синюю кнопку</b> 📱 в левом нижнем углу, чтобы открыть трекер и начать строить свое будущее!\n\n📌 <b>Совет:</b> Закрепите этого бота в списке чатов, чтобы не забывать о своих целях.`,
    reminder: `Привет, {{username}}! 🌟 Не забудьте отметить свои привычки сегодня, чтобы сохранить серию!`,
    support_thanks: `Спасибо за поддержку в {{amount}} звезд! 🌟 Вы получили бонус {{xp}} XP! Продолжайте в том же духе!`,
    invoice_title: "Поддержать Habit Tracker",
    invoice_desc: "Поддержите разработку с помощью {{amount}} Telegram Stars 🌟"
  }
};

function t(lang, key, params = {}) {
  const language = BOT_TRANSLATIONS[lang] ? lang : 'en';
  let text = BOT_TRANSLATIONS[language][key] || BOT_TRANSLATIONS['en'][key] || key;
  Object.keys(params).forEach(p => {
    text = text.replace(`{{${p}}}`, params[p]);
  });
  return text;
}

const directus = createDirectus(directusUrl)
  .with(rest())
  .with(staticToken(directusToken));

// Express setup for the Stars API
const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to create a Telegram Stars invoice link
app.post('/api/create-stars-invoice', async (req, res) => {
  const { amount, userId } = req.body;
  
  if (!amount || !userId) {
    return res.status(400).json({ error: "Amount and userId are required" });
  }

  try {
    const url = `https://api.telegram.org/bot${telegramToken}/createInvoiceLink`;
    // Fetch user language for invoice
    const users = await directus.request(readItems('users', {
      filter: { id: { _eq: userId } }
    }));
    const userLang = users?.[0]?.language || 'en';

    const response = await axios.post(url, {
      title: t(userLang, 'invoice_title'),
      description: t(userLang, 'invoice_desc', { amount }),
      payload: `support_${userId}_${Date.now()}`,
      provider_token: "", // Empty for Telegram Stars
      currency: "XTR",
      prices: [{ label: "Support", amount: parseInt(amount) }]
    });

    if (response.data.ok) {
      res.json({ url: response.data.result });
    } else {
      res.status(500).json({ error: response.data.description });
    }
  } catch (error) {
    console.error('Error creating invoice link:', error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// Serve static files from the Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  // In Express 5, wildcards must be named (e.g., *any)
  app.get('*any', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});

// Telegram Update Handling (Long Polling) for Payments
let lastUpdateId = 0;
async function handleUpdates() {
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const response = await axios.get(url);
    const updates = response.data.result;

    for (const update of updates) {
      lastUpdateId = update.update_id;

      // Handle /start command
      if (update.message?.text === '/start') {
        const userLang = update.message.from.language_code === 'ru' ? 'ru' : 'en';
        const welcomeMessage = t(userLang, 'welcome');

        try {
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: update.message.chat.id,
            text: welcomeMessage,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending welcome message:', error.response?.data || error.message);
        }
      }
      
      // Handle Pre-Checkout Query (Mandatory for payments)
      if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${telegramToken}/answerPreCheckoutQuery`, {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
        console.log(`✅ Approved pre_checkout from ${update.pre_checkout_query.from.username}`);
      }

      // Handle successful payment
      if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        console.log(`💰 Success! Received ${payment.total_amount} Stars from ${update.message.from.username}`);
        
        try {
          // Extract userId from payload (format: support_USERID_TIMESTAMP)
          const parts = payment.invoice_payload.split('_');
          const userId = parts[1];
          const starsAmount = payment.total_amount;
          const xpBonus = starsAmount * 10; // Reward 10 XP per Star

          // Fetch current user data
          const user = await directus.request(readItems('users', {
            filter: { id: { _eq: userId } }
          }));

          if (user && user.length > 0) {
            const currentXP = user[0].total_xp || 0;
            const currentDonations = user[0].donate || 0;

            await directus.request(updateItem('users', userId, {
              total_xp: currentXP + xpBonus,
              donate: currentDonations + starsAmount,
              premium: true // Grant premium on any donation
            }));
            
            // Send a thank you message
            const userLang = user[0].language || 'en';
            await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              chat_id: update.message.chat.id,
              text: t(userLang, 'support_thanks', { amount: starsAmount, xp: xpBonus })
            });
            console.log(`Rewarded ${xpBonus} XP to user ${userId}`);
          }
        } catch (error) {
          console.error('Error processing successful payment reward:', error.message);
        }
      }
    }
  } catch (error) {
    // Suppress noise but log real errors
    if (error.code !== 'ECONNRESET' && error.code !== 'ETIMEDOUT') {
      console.error('Error getting updates:', error.message);
    }
  }
  setTimeout(handleUpdates, 1000);
}

handleUpdates();

// --- Existing Reminder Logic ---

async function sendReminder(user) {
  const today = new Date().toISOString().split('T')[0];
  const reminderKey = `${today}_${user.reminder_time}`;
  
  if (user.last_reminder_sent === reminderKey) {
    return;
  }

  const userLang = user.language || 'en';
  const message = t(userLang, 'reminder', { username: user.username });
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  
  try {
    await axios.post(url, {
      chat_id: user.telegram_id,
      text: message
    });
    console.log(`Reminder sent to ${user.username} (${user.telegram_id}) at ${user.reminder_time}`);
    
    await directus.request(updateItem('users', user.id, {
      last_reminder_sent: reminderKey
    }));
  } catch (error) {
    console.error(`Failed to send reminder to ${user.username}:`, error.response?.data || error.message);
  }
}

async function checkReminders() {
  try {
    const now = new Date();
    const users = await directus.request(readItems('users', {
      filter: {
        reminder_enabled: { _eq: true }
      }
    }));

    console.log(`[${now.toISOString()}] Checking reminders for ${users.length} users...`);

    for (const user of users) {
      if (!user.reminder_time || !user.timezone) {
        continue;
      }

      try {
        const userTimeStr = now.toLocaleTimeString('en-GB', {
          timeZone: user.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace('.', ':');

        if (userTimeStr === user.reminder_time) {
          await sendReminder(user);
        }
      } catch (tzError) {
        console.error(`Invalid timezone for user ${user.username}: ${user.timezone}`);
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

console.log('Reminder bot started with Stars support...');
checkReminders();
setInterval(checkReminders, 60000);
