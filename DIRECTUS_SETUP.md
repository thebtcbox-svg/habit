# Directus Schema Setup

To set up the necessary tables in Directus, you can use the Directus API or the Admin UI. Here are the collections and fields you need to create:

## 1. Users Collection (`users`)
- `id`: UUID (Primary Key)
- `telegram_id`: String (Unique, Required)
- `username`: String
- `total_xp`: Integer (Default: 0)

## 2. Habits Collection (`habits`)
- `id`: UUID (Primary Key)
- `user_id`: M2O relationship to `users`
- `name`: String (Required)
- `active`: Boolean (Default: true)
- `is_focus`: Boolean (Default: false)
- `reminder_time`: String (Optional, e.g., "08:00")
- `streak`: Integer (Default: 0)

## 3. Logs Collection (`logs`)
- `id`: UUID (Primary Key)
- `habit_id`: M2O relationship to `habits`
- `date`: Date (Required)
- `status`: String (Choices: `done`, `not_done`)
- `note`: Text (Optional)
- `xp_earned`: Integer (Default: 0)

---

# Required Access & Tokens

To make the app work, I need the following from you:

1.  **Directus URL**: The URL where your Directus instance is hosted (e.g., `https://your-directus.up.railway.app`).
2.  **Directus Static Token**: Create a user in Directus (or use an existing one) and generate a Static Token with permissions to read/write to the collections above.
3.  **Telegram Bot Token**: You'll need this to set up the Mini App via @BotFather.
4.  **Railway Environment Variables**:
    - `VITE_DIRECTUS_URL`: Your Directus URL.
    - `VITE_DIRECTUS_TOKEN`: Your Directus Static Token.
