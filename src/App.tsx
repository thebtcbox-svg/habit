import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { directus, Habit, User } from './lib/directus';
import { readItems, createItem, updateItem } from '@directus/sdk';
import { CheckCircle2, Circle, Star, Trophy, Plus, Settings, X } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [completedToday, setCompletedToday] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'stats' | 'settings'>('today');

  useEffect(() => {
    const initApp = async () => {
      try {
        WebApp.ready();
        WebApp.expand();

        const tgUser = WebApp.initDataUnsafe.user;
        
        // For development: use a mock user if not in Telegram
        const userId = tgUser?.id.toString() || 'dev_user_123';
        const username = tgUser?.username || tgUser?.first_name || 'Dev User';

        console.log('Initializing for user:', { userId, username });
        
        // 1. Find or Create User in Directus
        let directusUser: User;
        let users: User[] = [];
        
        try {
          users = await directus.request(readItems('users', {
            filter: { telegram_id: { _eq: userId } }
          })) as User[];
        } catch (err: any) {
          console.error('Failed to fetch user:', err);
          throw new Error(`Database connection failed: ${err.message || 'Check your Directus URL and Token'}`);
        }

        if (users.length === 0) {
          console.log('Creating new user in DB...');
          try {
            directusUser = await directus.request(createItem('users', {
              telegram_id: userId,
              username: username,
              total_xp: 0
            })) as User;
          } catch (err: any) {
            console.error('Failed to create user:', err);
            throw new Error(`Failed to create user record: ${err.message}`);
          }
        } else {
          directusUser = users[0];
        }
        setUser(directusUser);

        // 2. Fetch habits for this user
        try {
          const fetchedHabits = await directus.request(readItems('habits', {
            filter: { user_id: { _eq: directusUser.id } }
          }));
          setHabits(fetchedHabits as Habit[]);

          // 3. Fetch today's logs to see what's completed
          const today = new Date().toISOString().split('T')[0];
          const todayLogs = await directus.request(readItems('logs', {
            filter: {
              _and: [
                { date: { _eq: today } },
                { status: { _eq: 'done' } }
              ]
            }
          }));
          
          const userHabitIds = fetchedHabits.map(h => h.id);
          const userTodayLogs = todayLogs.filter(log => userHabitIds.includes(log.habit_id));
          setCompletedToday(userTodayLogs.map(log => log.habit_id));
        } catch (err: any) {
          console.error('Failed to fetch habits/logs:', err);
          // Don't throw here, just log. User might have no habits yet.
        }

      } catch (error: any) {
        console.error('Error initializing app:', error);
        WebApp.showAlert(`Init Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const toggleHabit = async (habitId: string) => {
    if (!user || completedToday.includes(habitId)) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const habit = habits.find(h => h.id === habitId);
      if (!habit) return;

      // 1. Create Log
      await directus.request(createItem('logs', {
        habit_id: habitId,
        date: today,
        status: 'done',
        xp_earned: 10
      }));

      // 2. Update Habit Streak
      await directus.request(updateItem('habits', habitId, {
        streak: (habit.streak || 0) + 1
      }));

      // 3. Update User XP
      await directus.request(updateItem('users', user.id, {
        total_xp: (user.total_xp || 0) + 10
      }));

      // Update local state
      setCompletedToday(prev => [...prev, habitId]);
      setHabits(prev => prev.map(h => h.id === habitId ? { ...h, streak: (h.streak || 0) + 1 } : h));
      setUser(prev => prev ? { ...prev, total_xp: (prev.total_xp || 0) + 10 } : null);

      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error('Error completing habit:', error);
      WebApp.showAlert('Failed to complete habit');
    }
  };

  const addHabit = async () => {
    if (!user || !newHabitName.trim()) return;

    try {
      const payload = {
        name: newHabitName.trim(),
        user_id: user.id,
        is_focus: habits.length === 0,
        active: true,
        streak: 0
      };
      
      const newHabit = await directus.request(createItem('habits', payload)) as Habit;

      if (newHabit) {
        setHabits(prev => [...prev, newHabit]);
        setNewHabitName('');
        setIsAddingHabit(false);
        WebApp.HapticFeedback.impactOccurred('medium');
      }
    } catch (error: any) {
      console.error('Error adding habit:', error);
      // Even if there's an error, let's log more info
      const msg = error.errors?.[0]?.message || error.message || 'Unknown error';
      WebApp.showAlert(`Failed to add habit: ${msg}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const focusHabit = habits.find(h => h.is_focus);
  const otherHabits = habits.filter(h => !h.is_focus);

  const renderContent = () => {
    if (activeTab === 'stats') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Trophy className="w-16 h-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Leaderboard</h2>
          <p className="text-slate-500">Coming soon! Compete with friends.</p>
        </div>
      );
    }

    if (activeTab === 'settings') {
      return (
        <div className="space-y-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between py-2">
              <span>Username</span>
              <span className="text-slate-400">{user?.username}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-slate-50">
              <span>Telegram ID</span>
              <span className="text-slate-400">{user?.telegram_id}</span>
            </div>
          </div>
          <button 
            onClick={() => WebApp.showAlert('Habit Tracker v1.0.0')}
            className="w-full py-4 bg-white text-slate-600 rounded-xl font-medium border border-slate-100 shadow-sm"
          >
            App Version
          </button>
        </div>
      );
    }

    return (
      <>
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Today</h1>
            <p className="text-slate-500 text-sm">Keep the momentum going</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="font-semibold">{user?.total_xp || 0} XP</span>
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
                <button 
                  onClick={() => toggleHabit(focusHabit.id)}
                  disabled={completedToday.includes(focusHabit.id)}
                  className={`p-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all ${
                    completedToday.includes(focusHabit.id) 
                    ? 'bg-indigo-400 text-indigo-100 cursor-not-allowed' 
                    : 'bg-white text-indigo-600'
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                  {completedToday.includes(focusHabit.id) ? 'Done' : 'Complete'}
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
                  {completedToday.includes(habit.id) ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div>
                  <h4 className={`font-semibold ${completedToday.includes(habit.id) ? 'text-slate-400 line-through' : ''}`}>
                    {habit.name}
                  </h4>
                  <p className="text-xs text-slate-400">{habit.streak} day streak</p>
                </div>
              </div>
              <button 
                onClick={() => toggleHabit(habit.id)}
                disabled={completedToday.includes(habit.id)}
                className={`transition-colors ${
                  completedToday.includes(habit.id) ? 'text-green-500' : 'text-slate-300 hover:text-indigo-600'
                }`}
              >
                <CheckCircle2 className="w-6 h-6" />
              </button>
            </div>
          ))}
          <button 
            onClick={() => setIsAddingHabit(true)}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Habit
          </button>
        </div>
      </section>

      {isAddingHabit && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">New Habit</h3>
              <button onClick={() => setIsAddingHabit(false)} className="p-2 bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="What habit do you want to build?"
              className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none mb-6"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHabit()}
            />
            <button 
              onClick={addHabit}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
            >
              Create Habit
            </button>
          </div>
        </div>
      )}

      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 font-sans text-slate-900">
      {renderContent()}

      {isAddingHabit && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">New Habit</h3>
              <button onClick={() => setIsAddingHabit(false)} className="p-2 bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="What habit do you want to build?"
              className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none mb-6"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHabit()}
            />
            <button 
              onClick={addHabit}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
            >
              Create Habit
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-4 right-4 bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl p-2 flex justify-around shadow-lg z-40">
        <button 
          onClick={() => setActiveTab('today')}
          className={`p-3 rounded-xl transition-colors ${activeTab === 'today' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
        >
          <CheckCircle2 className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={`p-3 rounded-xl transition-colors ${activeTab === 'stats' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
        >
          <Trophy className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`p-3 rounded-xl transition-colors ${activeTab === 'settings' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
        >
          <Settings className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}

export default App;
