import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';
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
    invoice_desc: "Support the development with {{amount}} Telegram Stars 🌟"
  },
  ru: {
    welcome: `Добро пожаловать! 🌟\n\nУспех строится на привычках. Мы верим, что фокус на <b>одной главной привычке</b> и отслеживание дополнительных — это секрет долгосрочного роста.\n\nНажмите <b>синюю кнопку</b> 📱 в левом нижнем углу, чтобы открыть трекер и начать строить свое будущее!\n\n📌 <b>Совет:</b> Закрепите этого бота в списке чатов, чтобы не забывать о своих целях.`,
    reminder: `Привет, {{username}}! 🌟 Не забудьте отметить свои привычки сегодня, чтобы сохранить серию!`,
    support_thanks: `Спасибо за поддержку в {{amount}} звезд! 🌟 Вы получили бонус {{xp}} XP! Продолжайте в том же духе!`,
    invoice_title: "Поддержать Habit Tracker",
    invoice_desc: "Поддержите разработку с помощью {{amount}} Telegram Stars 🌟"
  },
  ar: {
    welcome: `مرحباً بك! 🌟\n\nالنجاح يُبنى عادة تلو الأخرى. نحن نؤمن بأن تركيز طاقتك على <b>عادة أساسية واحدة</b> مع تتبع العادات الداعمة هو سر النمو على المدى الطويل.\n\nاضغط على <b>الزر الأزرق</b> 📱 في أسفل اليسار لفتح المتتبع والبدء في بناء مستقبلك!\n\n📌 <b>نصيحة:</b> قم بتثبيت هذا البوت في قائمة الدردشة لتظل مستمراً ولا تفقد أهدافك أبداً.`,
    reminder: `أهلاً {{username}}! 🌟 لا تنسَ تسجيل عاداتك اليوم والحفاظ على سلسلتك مستمرة!`,
    support_thanks: `شكراً لدعمك بـ {{amount}} من النجوم! 🌟 لقد حصلت على مكافأة {{xp}} XP! استمر في تحقيق أهدافك!`,
    invoice_title: "دعم Habit Tracker",
    invoice_desc: "دعم التطوير بـ {{amount}} من نجوم تليجرام 🌟"
  },
  es: {
    welcome: `¡Bienvenido! 🌟\n\nEl éxito se construye hábito a hábito. Creemos que enfocar tu energía en <b>un hábito principal</b> mientras haces seguimiento de los secundarios es el secreto para el crecimiento a largo plazo.\n\n¡Toca el <b>botón azul</b> 📱 abajo a la izquierda para abrir tu rastreador y empezar a construir tu futuro!\n\n📌 <b>Consejo:</b> Ancla este bot a tu lista de chats para mantenerte constante y nunca perder de vista tus metas.`,
    reminder: `¡Hola {{username}}! 🌟 ¡No olvides registrar tus hábitos hoy y mantener tu racha viva!`,
    support_thanks: `¡Gracias por tu apoyo de {{amount}} Estrellas! 🌟 ¡Has sido recompensado con un bono de {{xp}} XP! ¡Sigue aplastando esos hábitos!`,
    invoice_title: "Apoyar Habit Tracker",
    invoice_desc: "Apoya el desarrollo con {{amount}} Estrellas de Telegram 🌟"
  },
  id: {
    welcome: `Selamat datang! 🌟\n\nKesuksesan dibangun satu kebiasaan demi satu kebiasaan. Kami percaya bahwa memfokuskan energi Anda pada <b>satu kebiasaan utama</b> sambil melacak kebiasaan pendukung adalah rahasia pertumbuhan jangka panjang.\n\nKetuk <b>tombol biru</b> 📱 di kiri bawah untuk membuka pelacak Anda dan mulai membangun masa depan Anda!\n\n📌 <b>Tip:</b> Sematkan bot ini ke daftar obrolan Anda agar tetap konsisten dan tidak pernah melupakan tujuan Anda.`,
    reminder: `Halo {{username}}! 🌟 Jangan lupa mencatat kebiasaanmu hari ini dan jaga streak-mu tetap hidup!`,
    support_thanks: `Terima kasih atas dukunganmu sebesar {{amount}} Bintang! 🌟 Kamu telah dihadiahi bonus {{xp}} XP! Teruslah hancurkan targetmu!`,
    invoice_title: "Dukung Habit Tracker",
    invoice_desc: "Dukung pengembangan dengan {{amount}} Bintang Telegram 🌟"
  },
  fa: {
    welcome: `خوش آمدید! 🌟\n\nموفقیت با ساختن یک عادت در هر زمان به دست می‌آید. ما معتقدیم که تمرکز انرژی بر روی <b>یک عادت اصلی</b> در حالی که عادت‌های حمایتی خود را دنبال می‌کنید، رمز رشد بلندمدت است.\n\nروی <b>دکمه آبی</b> 📱 در پایین سمت چپ بزنید تا ردیاب خود را باز کنید و ساختن آینده خود را شروع کنید!\n\n📌 <b>نکته:</b> این ربات را در لیست چت‌های خود پین کنید تا ثابت‌قدم بمانید و هرگز اهداف خود را گم نکنید.`,
    reminder: `سلام {{username}}! 🌟 فراموش نکن که امروز عادت‌هات رو ثبت کنی و توالی خودت رو حفظ کنی!`,
    support_thanks: `ممنون از حمایت شما با {{amount}} ستاره! 🌟 شما {{xp}} امتیاز پاداش گرفتید! به تلاش خود ادامه دهید!`,
    invoice_title: "حمایت از Habit Tracker",
    invoice_desc: "حمایت از توسعه با {{amount}} ستاره تلگرام 🌟"
  },
  uk: {
    welcome: `Ласкаво просимо! 🌟\n\nУспіх будується по одній звичці за раз. Ми віримо, що зосередження вашої енергії на <b>одній основній звичці</b> під час відстеження допоміжних — це секрет довгострокового зростання.\n\nНатисніть <b>синю кнопку</b> 📱 знизу ліворуч, щоб відкрити свій трекер і почати будувати своє майбутнє!\n\n📌 <b>Порада:</b> Закріпіть цього бота у списку чатів, щоб залишатися послідовним і ніколи не втрачати свої цілі з виду.`,
    reminder: `Привіт, {{username}}! 🌟 Не забудьте відмітити свої звички сьогодні, щоб зберегти серію!`,
    support_thanks: `Дякуємо за вашу підтримку у {{amount}} зірок! 🌟 Ви отримали бонус {{xp}} XP! Продовжуйте в тому ж дусі!`,
    invoice_title: "Підтримати Habit Tracker",
    invoice_desc: "Підтримайте розробку за допомогою {{amount}} зірок Telegram 🌟"
  },
  de: {
    welcome: `Willkommen! 🌟\n\nErfolg wird Gewohnheit für Gewohnheit aufgebaut. Wir glauben, dass die Konzentration auf <b>eine Hauptgewohnheit</b>, während du deine unterstützenden verfolgst, das Geheimnis für langfristiges Wachstum ist.\n\nTipper auf den <b>blauen Button</b> 📱 unten links, um deinen Tracker zu öffnen und deine Zukunft zu gestalten!\n\n📌 <b>Tipp:</b> Pinne diesen Bot in deine Chat-Liste, um konsistent zu bleiben und deine Ziele nie aus den Augen zu verlieren.`,
    reminder: `Hey {{username}}! 🌟 Vergiss nicht, heute deine Gewohnheiten zu loggen und deine Serie am Leben zu erhalten!`,
    support_thanks: `Vielen Dank für deine Unterstützung mit {{amount}} Sternen! 🌟 Du wurdest mit einem {{xp}} XP-Bonus belohnt! Mach weiter so mit deinen Gewohnheiten!`,
    invoice_title: "Habit Tracker unterstützen",
    invoice_desc: "Unterstütze die Entwicklung mit {{amount}} Telegram-Sternen 🌟"
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
        const langCode = update.message.from.language_code;
        const userLang = BOT_TRANSLATIONS[langCode] ? langCode : 'en';
        const welcomeMessage = t(userLang, 'welcome');

        try {
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: update.message.chat.id,
            text: welcomeMessage,
            parse_mode: 'HTML'
          });

          // Send start.JPG photo after the welcome message
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
