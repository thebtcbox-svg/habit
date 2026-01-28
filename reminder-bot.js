import { createDirectus, rest, staticToken, readItems, updateItem, createItem } from '@directus/sdk';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
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
    invoice_desc: "Support the development with {{amount}} Telegram Stars 🌟",
    battle_invite: `⚔️ {{initiator}} has invited you to a BATTLE in Habit Tracker! Open the app to accept the challenge.`,
    battle_victory: `🏆 CONGRATULATIONS, CHAMPION! You won the battle against {{opponent}}! ⚔️\n\nResult: +100 XP awarded. Keep crushing your goals! 🚀`,
    battle_defeat: `🦾 Keep your head up! "Success is not final, failure is not fatal: it is the courage to continue that counts."\n\nYou lost the battle against {{opponent}}. -50 XP. Consistency is key! 🦾`,
    battle_draw: `🤝 Great effort! The battle against {{opponent}} ended in a draw. No XP changed. Stay consistent! 📈`
  },
  ru: {
    welcome: `Добро пожаловать! 🌟\n\nУспех строится на привычках. Мы верим, что фокус на <b>одной главной привычке</b> и отслеживание дополнительных — это секрет долгосрочного роста.\n\nНажмите <b>синюю кнопку</b> 📱 в левом нижнем углу, чтобы открыть трекер и начать строить свое будущее!\n\n📌 <b>Совет:</b> Закрепите этого бота в списке чатов, чтобы не забывать о своих целях.`,
    reminder: `Привет, {{username}}! 🌟 Не забудьте отметить свои привычки сегодня, чтобы сохранить серию!`,
    support_thanks: `Спасибо за поддержку в {{amount}} звезд! 🌟 Вы получили бонус {{xp}} XP! Продолжайте в том же духе!`,
    invoice_title: "Поддержать Habit Tracker",
    invoice_desc: "Поддержите разработку с помощью {{amount}} Telegram Stars 🌟",
    battle_invite: `⚔️ {{initiator}} пригласил вас на БИТВУ в Habit Tracker! Откройте приложение, чтобы принять вызов.`,
    battle_victory: `🏆 ПОЗДРАВЛЯЕМ, ЧЕМПИОН! Вы победили в битве против {{opponent}}! ⚔️\n\nРезультат: +100 XP. Так держать! 🚀`,
    battle_defeat: `🦾 Не сдавайтесь! "Успех — это не конец, поражение — это не фатально: мужество продолжать — вот что имеет значение."\n\nВы проиграли в битве против {{opponent}}. -50 XP. Главное — дисциплина! 🦾`,
    battle_draw: `🤝 Отличная работа! Битва против {{opponent}} закончилась вничью. XP не изменились. Продолжайте в том же духе! 📈`
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

// Express setup
const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to create a Telegram Stars invoice link
app.post('/api/create-stars-invoice', async (req, res) => {
  const { amount, userId } = req.body;
  if (!amount || !userId) return res.status(400).json({ error: "Amount and userId are required" });
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/createInvoiceLink`;
    const users = await directus.request(readItems('users', { filter: { id: { _eq: userId } } }));
    const userLang = users?.[0]?.language || 'en';
    const response = await axios.post(url, {
      title: t(userLang, 'invoice_title'),
      description: t(userLang, 'invoice_desc', { amount }),
      payload: `support_${userId}_${Date.now()}`,
      provider_token: "", 
      currency: "XTR",
      prices: [{ label: "Support", amount: parseInt(amount) }]
    });
    if (response.data.ok) res.json({ url: response.data.result });
    else res.status(500).json({ error: response.data.description });
  } catch (error) {
    console.error('Error creating invoice link:', error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

app.post('/api/battle-notification', async (req, res) => {
  const { targetTgId, initiatorName, language } = req.body;
  if (!targetTgId || !initiatorName) return res.status(400).json({ error: "Missing fields" });
  try {
    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      chat_id: targetTgId,
      text: t(language || 'en', 'battle_invite', { initiator: initiatorName })
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error sending battle notification:', error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*any', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});

// Telegram Update Handling (Long Polling)
let lastUpdateId = 0;
async function handleUpdates() {
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const response = await axios.get(url);
    const updates = response.data.result;
    for (const update of updates) {
      lastUpdateId = update.update_id;
      if (update.message?.text === '/start') {
        const langCode = update.message.from.language_code;
        const userLang = BOT_TRANSLATIONS[langCode] ? langCode : 'en';
        await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id: update.message.chat.id,
          text: t(userLang, 'welcome'),
          parse_mode: 'HTML'
        });
        const photoPath = path.join(__dirname, 'start.JPG');
        try {
          const photoBuffer = await fs.readFile(photoPath);
          const formData = new FormData();
          formData.append('chat_id', update.message.chat.id);
          formData.append('photo', new Blob([photoBuffer]), 'start.JPG');
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendPhoto`, formData);
        } catch (photoError) {
          console.error('Error sending start photo:', photoError.message);
        }
      }
      if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${telegramToken}/answerPreCheckoutQuery`, {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        });
      }
      if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        try {
          const userId = payment.invoice_payload.split('_')[1];
          const starsAmount = payment.total_amount;
          const xpBonus = starsAmount * 10;
          const users = await directus.request(readItems('users', { filter: { id: { _eq: userId } } }));
          if (users && users.length > 0) {
            await directus.request(updateItem('users', userId, {
              total_xp: (users[0].total_xp || 0) + xpBonus,
              donate: (users[0].donate || 0) + starsAmount,
              premium: true
            }));
            await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              chat_id: update.message.chat.id,
              text: t(users[0].language || 'en', 'support_thanks', { amount: starsAmount, xp: xpBonus })
            });
          }
        } catch (error) {
          console.error('Error processing successful payment reward:', error.message);
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ECONNRESET' && error.code !== 'ETIMEDOUT') console.error('Error getting updates:', error.message);
  }
  setTimeout(handleUpdates, 1000);
}
handleUpdates();

// Existing Reminder Logic
async function sendReminder(user) {
  const today = new Date().toISOString().split('T')[0];
  const reminderKey = `${today}_${user.reminder_time}`;
  if (user.last_reminder_sent === reminderKey) return;
  try {
    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      chat_id: user.telegram_id,
      text: t(user.language || 'en', 'reminder', { username: user.username })
    });
    await directus.request(updateItem('users', user.id, { last_reminder_sent: reminderKey }));
  } catch (error) {
    console.error(`Failed to send reminder to ${user.username}:`, error.response?.data || error.message);
  }
}

async function checkReminders() {
  try {
    const now = new Date();
    const users = await directus.request(readItems('users', { filter: { reminder_enabled: { _eq: true } } }));
    for (const user of users) {
      if (!user.reminder_time || !user.timezone) continue;
      try {
        const userTimeStr = now.toLocaleTimeString('en-GB', { timeZone: user.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
        if (userTimeStr === user.reminder_time) await sendReminder(user);
      } catch (tzError) {
        console.error(`Invalid timezone for user ${user.username}: ${user.timezone}`);
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

async function checkBattles() {
  try {
    const now = new Date();
    const activeBattles = await directus.request(readItems('battles', { filter: { status: { _eq: 'active' } } }));
    for (const b of activeBattles) {
      const initiator = (await directus.request(readItems('users', { filter: { id: { _eq: b.initiator_id } } })))[0];
      const opponent = (await directus.request(readItems('users', { filter: { id: { _eq: b.opponent_id } } })))[0];
      if (!initiator || !opponent) continue;
      const users = [
        { data: initiator, role: 'initiator', habitId: b.initiator_habit_id },
        { data: opponent, role: 'opponent', habitId: b.opponent_habit_id }
      ];
      for (const u of users) {
        try {
          const userTimeStr = now.toLocaleTimeString('en-GB', { timeZone: u.data.timezone || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
          if (userTimeStr === '10:00') {
            const today = now.toISOString().split('T')[0];
            const notifiedKey = `notified_${u.data.id}_${today}`;
            if (b.last_notified === notifiedKey) continue;
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const iLogs = await directus.request(readItems('logs', { filter: { user_id: { _eq: initiator.id }, habit_id: { _eq: b.initiator_habit_id }, date: { _eq: yesterdayStr }, status: { _eq: 'done' } } }));
            const oLogs = await directus.request(readItems('logs', { filter: { user_id: { _eq: opponent.id }, habit_id: { _eq: b.opponent_habit_id }, date: { _eq: yesterdayStr }, status: { _eq: 'done' } } }));
            
            // Check if done on the same day (date_created matches date)
            const iDone = iLogs.some(l => l.date_created && l.date_created.startsWith(l.date));
            const oDone = oLogs.some(l => l.date_created && l.date_created.startsWith(l.date));

            let winnerId = null, loserId = null, finished = false;
            if (iDone && !oDone) { winnerId = initiator.id; loserId = opponent.id; finished = true; }
            else if (!iDone && oDone) { winnerId = opponent.id; loserId = initiator.id; finished = true; }
            else if (!iDone && !oDone) { loserId = 'both'; finished = true; }
            
            if (finished) {
              await directus.request(updateItem('battles', b.id, { status: 'finished', winner_id: winnerId === 'both' ? null : winnerId, loser_id: loserId === 'both' ? null : loserId, ended_at: now.toISOString() }));
              if (winnerId && winnerId !== 'both') {
                const winUser = winnerId === initiator.id ? initiator : opponent;
                await directus.request(updateItem('users', winUser.id, { total_xp: (winUser.total_xp || 0) + 100 }));
              }
              if (loserId) {
                const losers = loserId === 'both' ? [initiator, opponent] : [loserId === initiator.id ? initiator : opponent];
                for (const l of losers) await directus.request(updateItem('users', l.id, { total_xp: Math.max(0, (l.total_xp || 0) - 50) }));
              }
            }
            let msg = '';
            const oppName = u.role === 'initiator' ? opponent.username : initiator.username;
            if (finished) {
              if (winnerId === u.data.id) msg = t(u.data.language, 'battle_victory', { opponent: oppName });
              else if (loserId === u.data.id || loserId === 'both') msg = t(u.data.language, 'battle_defeat', { opponent: oppName });
              else msg = t(u.data.language, 'battle_draw', { opponent: oppName });
              await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, { chat_id: u.data.telegram_id, text: msg });
              await directus.request(updateItem('battles', b.id, { last_notified: notifiedKey }));
            }
          }
        } catch (e) { console.error('Error processing battle for user:', u.data.username, e); }
      }
    }
  } catch (error) { console.error('Error checking battles:', error); }
}

console.log('Reminder bot started with Stars support and Battles...');
checkReminders();
setInterval(checkReminders, 60000);
setInterval(checkBattles, 60000);
