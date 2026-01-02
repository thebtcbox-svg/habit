import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { directus, Habit, User } from './lib/directus';
import { readItems, createItem } from '@directus/sdk';
import { CheckCircle2, Circle, Star, Trophy, Plus, Settings } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      try {
        const tgUser = WebApp.initDataUnsafe.user;
        if (tgUser) {
          console.log('Telegram User:', tgUser);
          
          // 1. Find or Create User in Directus
          let directusUser: User;
          const users = await directus.request(readItems('users', {
            filter: { telegram_id: { _eq: tgUser.id.toString() } }
          }));

          if (users.length === 0) {
            // Create new user
            directusUser = await directus.request(createItem('users', {
              telegram_id: tgUser.id.toString(),
              username: tgUser.username || tgUser.first_name,
              total_xp: 0
            })) as User;
          } else {
            directusUser = users[0] as User;
          }
          setUser(directusUser);

          // 2. Fetch habits for this user
          const fetchedHabits = await directus.request(readItems('habits', {
            filter: { user_id: { _eq: directusUser.id } }
          }));
          setHabits(fetchedHabits as Habit[]);
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const focusHabit = habits.find(h => h.is_focus);
  const otherHabits = habits.filter(h => !h.is_focus);

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-900">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-slate-500 text-sm">Keep the momentum going</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <span className="font-semibold">120 XP</span>
        </div>
      </header>

      {focusHabit && (
        <section className="mb-8">
          <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
            <Star className="absolute -right-4 -top-4 w-24 h-24 text-indigo-500 opacity-50" />
            <div className="relative z-10">
              <span className="text-indigo-200 text-xs font-bold uppercase tracking-wider">Focus Habit</span>
              <h2 className="text-2xl font-bold mt-1 mb-4">{focusHabit.name}</h2>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-indigo-100 text-sm">Current Streak</span>
                  <span className="text-2xl font-bold">{focusHabit.streak} days</span>
                </div>
                <button className="bg-white text-indigo-600 p-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-transform">
                  <CheckCircle2 className="w-6 h-6" />
                  Done
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Other Habits</h3>
        <div className="space-y-3">
          {otherHabits.map(habit => (
            <div key={habit.id} className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
                  <Circle className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <h4 className="font-semibold">{habit.name}</h4>
                  <p className="text-xs text-slate-400">{habit.streak} day streak</p>
                </div>
              </div>
              <button className="text-slate-300 hover:text-indigo-600 transition-colors">
                <CheckCircle2 className="w-6 h-6" />
              </button>
            </div>
          ))}
          <button className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors">
            <Plus className="w-5 h-5" />
            Add Habit
          </button>
        </div>
      </section>

      <nav className="fixed bottom-6 left-4 right-4 bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl p-2 flex justify-around shadow-lg">
        <button className="p-3 text-indigo-600 bg-indigo-50 rounded-xl">
          <CheckCircle2 className="w-6 h-6" />
        </button>
        <button className="p-3 text-slate-400">
          <Trophy className="w-6 h-6" />
        </button>
        <button className="p-3 text-slate-400">
          <Settings className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}

export default App;
