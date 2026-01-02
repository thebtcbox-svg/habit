import { createDirectus, rest, staticToken } from '@directus/sdk';

export interface Habit {
  id: string;
  name: string;
  is_focus: boolean;
  active: boolean;
  user_id: string;
  reminder_time: string | null;
  streak: number;
}

export interface Log {
  id: string;
  habit_id: string;
  date: string;
  status: 'done' | 'not_done';
  note: string | null;
  xp_earned: number;
}

export interface User {
  id: string;
  telegram_id: string;
  username: string;
  total_xp: number;
}

interface Schema {
  habits: Habit[];
  logs: Log[];
  users: User[];
}

const directusUrl = import.meta.env.VITE_DIRECTUS_URL || 'https://directus-production-8063.up.railway.app';
const directusToken = import.meta.env.VITE_DIRECTUS_TOKEN || 'hlkYCjKa0GlsxwiA7-mppFq5DSVusz1';

export const directus = createDirectus<Schema>(directusUrl)
  .with(rest())
  .with(staticToken(directusToken));
