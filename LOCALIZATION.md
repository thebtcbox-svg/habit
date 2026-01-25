# Localization Documentation

This project supports multi-language functionality for both the Telegram Mini App (frontend) and the Telegram Bot (backend).

## Supported Languages
- English (`en`) - Default
- Russian (`ru`)
- Arabic (`ar`)
- Spanish (`es`)
- Indonesian (`id`)
- Farsi (`fa`)
- Ukrainian (`uk`)
- German (`de`)

## Localized Files

### 1. Frontend (React)
The frontend uses `i18next` and `react-i18next` for localization.

- **Configuration**: `src/i18n.ts`
- **Translation Files**: `src/locales/*.json`
  - `en.json`: English
  - `ru.json`: Russian
  - `ar.json`: Arabic
  - `es.json`: Spanish
  - `id.json`: Indonesian
  - `fa.json`: Farsi
  - `uk.json`: Ukrainian
  - `de.json`: German
- **Implementation**: `src/App.tsx` (using `useTranslation` hook)

### 2. Backend (Telegram Bot)
The bot uses a custom lightweight translation helper.

- **Implementation**: `reminder-bot.js`
- **Translations**: Defined in the `BOT_TRANSLATIONS` object within the file.

### 3. Database (Directus)
- **Collection**: `users`
- **Field**: `language` (String)
- **Purpose**: Stores the user's preferred language code.

## What Needs Attention

### Adding a New Language
1.  **Directus**: Add the new language code to the "choices" of the `language` field in the `users` collection.
2.  **Frontend**:
    - Create a new JSON file in `src/locales/` (e.g., `fr.json`).
    - Import and register it in `src/i18n.ts`.
    - Add the option to the `<select>` dropdown in `src/App.tsx` (Settings tab).
3.  **Bot**:
    - Add the translations to the `BOT_TRANSLATIONS` object in `reminder-bot.js`.

### Translation Keys
Ensure that any new text added to the app is added to **all** JSON files in `src/locales/` and the `BOT_TRANSLATIONS` object in `reminder-bot.js`. If a key is missing, it will fallback to the English version.

### RTL Support
Languages like Arabic and Farsi are Right-to-Left (RTL). The current UI is primarily Left-to-Right (LTR). For a perfect experience, you might want to adjust the CSS direction based on the active language:
```javascript
// Example in App.tsx
useEffect(() => {
  document.dir = i18n.dir();
}, [i18n.language]);
```

### Date Formatting
Current date formatting uses `.toLocaleDateString('default', ...)`. This usually follows the browser/system locale. If you want the dates to strictly follow the app's selected language, use:
```javascript
new Date().toLocaleDateString(i18n.language, ...)
```
