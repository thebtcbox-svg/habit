import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import axios from 'axios';

const directusUrl = process.env.VITE_DIRECTUS_URL || 'https://directus-production-8063.up.railway.app';
const directusToken = process.env.VITE_DIRECTUS_TOKEN || 'e8_Dvaln7O6vTobil6uBOzO74GsSJ_2i';
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '8047939266:AAGWTytDQMPEio9jWP8KYpBZjZaqO0jlLM8';

const directus = createDirectus(directusUrl)
  .with(rest())
  .with(staticToken(directusToken));

const sentReminders = new Map(); // user_id -> last_sent_date_string

async function sendReminder(user) {
  const today = new Date().toISOString().split('T')[0];
  const lastSent = sentReminders.get(user.id);
  
  if (lastSent === today) {
    return; // Already sent today
  }

  const message = `Hey ${user.username}! 🌟 Don't forget to log your habits today and keep your streak alive!`;
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  
  try {
    await axios.post(url, {
      chat_id: user.telegram_id,
      text: message
    });
    console.log(`Reminder sent to ${user.username} (${user.telegram_id})`);
    sentReminders.set(user.id, today);
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
        // Get current time in user's timezone
        const userTimeStr = now.toLocaleTimeString('en-GB', {
          timeZone: user.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        // Check if the current time matches the reminder time
        // We check if the current hour:minute matches the user's reminder_time
        // To be more robust with the 30-min interval, we check if we are in the correct hour
        // and if the reminder hasn't been sent today yet.
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

// Check every minute to ensure we don't miss the window
console.log('Reminder bot started (Precision mode)...');
checkReminders();
setInterval(checkReminders, 60000); // Every 1 minute
