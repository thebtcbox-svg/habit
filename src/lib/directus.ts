import { createDirectus, rest, staticToken } from '@directus/sdk';

export interface Habit {
  id: string | number;
  name: string;
  is_focus: boolean;
  active: boolean;
  user_id: string | number;
  reminder_time: string | null;
  streak: number;
}

export interface Log {
  id: string | number;
  habit_id: string | number;
  user_id: string | number;
  date: string;
  status: 'done' | 'not_done';
  note: string | null;
  xp_earned: number;
}

export interface User {
  id: string | number;
  telegram_id: string;
  username: string;
  total_xp: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  timezone: string | null;
}

interface Schema {
  habits: Habit[];
  logs: Log[];
  users: User[];
}

const directusUrl = import.meta.env.VITE_DIRECTUS_URL || 'https://directus-production-8063.up.railway.app';
const directusToken = import.meta.env.VITE_DIRECTUS_TOKEN || 'e8_Dvaln7O6vTobil6uBOzO74GsSJ_2i';

export const directus = createDirectus<Schema>(directusUrl)
  .with(rest())
  .with(staticToken(directusToken));
