import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { directus, Habit, User, Log } from './lib/directus';
import { readItems, createItem, updateItem, deleteItem } from '@directus/sdk';
import { CheckCircle2, Circle, Star, Trophy, Plus, Settings, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, Bell, BellOff, MessageSquare, Save, Pencil, Check } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [completedToday, setCompletedToday] = useState<(string | number)[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'calendar' | 'settings'>('today');
  const [selectedHabitId, setSelectedHabitId] = useState<string | number | null>(null);
  const [habitLogs, setHabitLogs] = useState<Log[]>([]);
  const [isAddingNote, setIsAddingNote] = useState<string | number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | number | null>(null);
  const [editingHabitName, setEditingHabitName] = useState('');

  useEffect(() => {
    if (habits.length > 0 && !selectedHabitId) {
      const focus = habits.find(h => h.is_focus);
      setSelectedHabitId(focus ? focus.id : habits[0].id);
    }
  }, [habits]);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!selectedHabitId) return;
      try {
        const logs = await directus.request(readItems('logs', {
          filter: { habit_id: { _eq: selectedHabitId } },
          limit: 100
        }));
        setHabitLogs(logs as Log[]);
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    if (activeTab === 'calendar') {
      fetchLogs();
    }
  }, [activeTab, selectedHabitId]);

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
        console.log('Fetching user with telegram_id:', userId);
        // Use a direct fetch to test if it's an SDK issue or CORS
        const url = `https://directus-production-8063.up.railway.app/items/users?filter[telegram_id][_eq]=${userId}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': 'Bearer e8_Dvaln7O6vTobil6uBOzO74GsSJ_2i'
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.errors?.[0]?.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        users = result.data as User[];
        console.log('User fetch response:', users);
      } catch (err: any) {
        console.error('Detailed fetch error:', err);
        throw new Error(`Database connection failed: ${err.message}`);
      }

      if (users.length === 0) {
        console.log('Creating new user in DB...');
        try {
          // Ensure we don't send an empty string for telegram_id if it's a mock user
          const newUser = {
            telegram_id: userId,
            username: username,
            total_xp: 0
          };
          console.log('Creating user with payload:', newUser);
          directusUser = await directus.request(createItem('users', newUser)) as User;
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

        // 3. Fetch logs for selected date to see what's completed
        const logs = await directus.request(readItems('logs', {
          filter: {
            _and: [
              { date: { _eq: selectedDate } },
              { status: { _eq: 'done' } }
            ]
          }
        }));
        
        const userHabitIds = fetchedHabits.map(h => h.id);
        const userDateLogs = logs.filter(log => userHabitIds.includes(log.habit_id));
        setCompletedToday(userDateLogs.map(log => log.habit_id));
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

  useEffect(() => {
    initApp();
  }, [selectedDate]);

  const toggleHabit = async (habitId: string | number) => {
    if (!user) return;

    const isCompleted = completedToday.includes(habitId);
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    try {
      if (isCompleted) {
        // UNDO HABIT
        // 1. Find and Delete Log (both done and not_done with notes)
        const logs = await directus.request(readItems('logs', {
          filter: {
            _and: [
              { habit_id: { _eq: habitId } },
              { date: { _eq: selectedDate } }
            ]
          }
        }));

        for (const log of logs) {
          // @ts-ignore
          await directus.request(deleteItem('logs', log.id));
        }

        // 2. Update Habit Streak (only if it's today and we are undoing a 'done' status)
        const wasDone = logs.some(l => l.status === 'done');
        const isToday = selectedDate === new Date().toISOString().split('T')[0];
        if (isToday && wasDone) {
          await directus.request(updateItem('habits', habitId as any, {
            streak: Math.max(0, (habit.streak || 0) - 1)
          }));
          setHabits(prev => prev.map(h => h.id === habitId ? { ...h, streak: Math.max(0, (h.streak || 0) - 1) } : h));
        }

        // 3. Update User XP (only if it was done)
        if (wasDone) {
          await directus.request(updateItem('users', user.id as any, {
            total_xp: Math.max(0, (user.total_xp || 0) - 10)
          }));
          setUser(prev => prev ? { ...prev, total_xp: Math.max(0, (prev.total_xp || 0) - 10) } : null);
        }

        // Update local state
        setCompletedToday(prev => prev.filter(id => id !== habitId));

        WebApp.HapticFeedback.notificationOccurred('warning');
      } else {
        // COMPLETE HABIT
        // 1. Create Log
        await directus.request(createItem('logs', {
          habit_id: habitId as any,
          date: selectedDate,
          status: 'done',
          xp_earned: 10
        }));

        // 2. Update Habit Streak (only if it's today)
        const isToday = selectedDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          await directus.request(updateItem('habits', habitId as any, {
            streak: (habit.streak || 0) + 1
          }));
          setHabits(prev => prev.map(h => h.id === habitId ? { ...h, streak: (h.streak || 0) + 1 } : h));
        }

        // 3. Update User XP
        await directus.request(updateItem('users', user.id as any, {
          total_xp: (user.total_xp || 0) + 10
        }));

        // Update local state
        setCompletedToday(prev => [...prev, habitId]);
        setUser(prev => prev ? { ...prev, total_xp: (prev.total_xp || 0) + 10 } : null);

        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (error) {
      console.error('Error toggling habit:', error);
      WebApp.showAlert('Failed to update habit');
    }
  };

  const saveNote = async (habitId: string | number | null) => {
    if (!habitId || !user || !noteText.trim()) return;
    try {
      // 1. Delete any existing log for this date/habit
      const existingLogs = await directus.request(readItems('logs', {
        filter: {
          _and: [
            { habit_id: { _eq: habitId } },
            { date: { _eq: selectedDate } }
          ]
        }
      }));

      for (const log of existingLogs) {
        // @ts-ignore
        await directus.request(deleteItem('logs', log.id));
      }

      // 2. Create new log with status 'not_done' and note
      await directus.request(createItem('logs', {
        habit_id: habitId as any,
        date: selectedDate,
        status: 'not_done',
        note: noteText.trim(),
        xp_earned: 0
      }));

      setIsAddingNote(null);
      setNoteText('');
      WebApp.HapticFeedback.notificationOccurred('success');
      
      // Refresh logs if we are on calendar tab
      if (activeTab === 'calendar' && selectedHabitId) {
        const logs = await directus.request(readItems('logs', {
          filter: { habit_id: { _eq: selectedHabitId } },
          limit: 100
        }));
        setHabitLogs(logs as Log[]);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      WebApp.showAlert('Failed to save note');
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

  const setFocusHabit = async (habitId: string | number) => {
    if (!user) return;
    try {
      // 1. Unset current focus habit
      const currentFocus = habits.find(h => h.is_focus);
      if (currentFocus) {
        await directus.request(updateItem('habits', currentFocus.id as any, { is_focus: false }));
      }

      // 2. Set new focus habit
      await directus.request(updateItem('habits', habitId as any, { is_focus: true }));

      // Update local state
      setHabits(prev => prev.map(h => ({
        ...h,
        is_focus: h.id === habitId
      })));

      WebApp.HapticFeedback.impactOccurred('medium');
    } catch (error) {
      console.error('Error setting focus habit:', error);
      WebApp.showAlert('Failed to update focus habit');
    }
  };

  const deleteHabit = async (habitId: string | number) => {
    if (!user) return;
    
    WebApp.showConfirm('Are you sure you want to delete this habit? All XP earned from this habit will be removed.', async (confirmed) => {
      if (confirmed) {
        try {
          // 1. Count completions to subtract XP
          const logs = await directus.request(readItems('logs', {
            filter: { 
              habit_id: { _eq: habitId },
              status: { _eq: 'done' }
            },
            limit: -1
          }));
          
          const xpToSubtract = logs.length * 10;

          // 2. Update User XP
          await directus.request(updateItem('users', user.id as any, {
            total_xp: Math.max(0, (user.total_xp || 0) - xpToSubtract)
          }));

          // 3. Delete Habit
          // @ts-ignore
          await directus.request(deleteItem('habits', habitId));
          
          // Update local state
          setHabits(prev => prev.filter(h => h.id !== habitId));
          setUser(prev => prev ? { ...prev, total_xp: Math.max(0, (prev.total_xp || 0) - xpToSubtract) } : null);
          
          if (selectedHabitId === habitId) {
            setSelectedHabitId(habits.find(h => h.id !== habitId)?.id || null);
          }
          
          WebApp.HapticFeedback.notificationOccurred('success');
        } catch (error) {
          console.error('Error deleting habit:', error);
          WebApp.showAlert('Failed to delete habit');
        }
      }
    });
  };

  const updateGlobalReminder = async (enabled: boolean, time: string | null) => {
    if (!user) return;
    try {
      await directus.request(updateItem('users', user.id as any, { 
        reminder_enabled: enabled,
        reminder_time: time 
      }));
      setUser(prev => prev ? { ...prev, reminder_enabled: enabled, reminder_time: time } : null);
      WebApp.HapticFeedback.impactOccurred('light');
    } catch (error) {
      console.error('Error updating global reminder:', error);
      WebApp.showAlert('Failed to update reminder settings');
    }
  };

  const renameHabit = async (habitId: string | number) => {
    if (!editingHabitName.trim()) return;
    try {
      await directus.request(updateItem('habits', habitId as any, { name: editingHabitName.trim() }));
      setHabits(prev => prev.map(h => h.id === habitId ? { ...h, name: editingHabitName.trim() } : h));
      setEditingHabitId(null);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error('Error renaming habit:', error);
      WebApp.showAlert('Failed to rename habit');
    }
  };

  const renderCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Adjust for Monday start if needed, but standard is Sunday (0)
    // Let's use Sunday start for simplicity or adjust to Monday
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start

    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = habitLogs.find(l => l.date.startsWith(dateStr));
      const isDone = log?.status === 'done';
      const hasNote = log?.status === 'not_done' && log.note;
      const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
      const isSelected = selectedCalendarDay === dateStr;

      days.push(
        <div 
          key={d} 
          onClick={() => setSelectedCalendarDay(dateStr)}
          className={`h-10 flex items-center justify-center rounded-lg text-sm relative cursor-pointer transition-all ${
            isDone ? 'bg-indigo-600 text-white font-bold' : 'bg-white text-slate-600'
          } ${hasNote ? 'border-2 border-red-200' : ''} ${isToday && !isDone ? 'border-2 border-indigo-600' : ''} ${isSelected ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
        >
          {d}
          {isDone && <div className="absolute bottom-1 w-1 h-1 bg-white rounded-full" />}
          {hasNote && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-400 rounded-full" />}
        </div>
      );
    }

    const monthName = now.toLocaleString('default', { month: 'long' });

    const selectedDayLog = habitLogs.find(l => l.date.startsWith(selectedCalendarDay || ''));

    return (
      <div className="space-y-6">
        <header className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Progress</h2>
          <select 
            value={selectedHabitId ?? ''} 
            onChange={(e) => setSelectedHabitId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {habits.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </header>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">{monthName} {year}</h3>
            <div className="flex gap-2">
              <button className="p-1 text-slate-400 hover:text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
              <button className="p-1 text-slate-400 hover:text-slate-600"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(day => (
              <div key={day} className="text-center text-xs font-bold text-slate-400">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {days}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Habit XP (Month)</p>
            <p className="text-2xl font-bold text-indigo-600">{habitLogs.filter(l => l.status === 'done').length * 10}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Days Done</p>
            <p className="text-2xl font-bold text-green-600">{habitLogs.filter(l => l.status === 'done').length}</p>
          </div>
        </div>

        {selectedCalendarDay && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-slate-800">
                {new Date(selectedCalendarDay).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
              </h4>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                selectedDayLog?.status === 'done' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
              }`}>
                {selectedDayLog?.status === 'done' ? 'Completed' : 'Missed'}
              </span>
            </div>
            {selectedDayLog?.note ? (
              <p className="text-slate-600 text-sm italic">"{selectedDayLog.note}"</p>
            ) : (
              <p className="text-slate-400 text-sm">No notes for this day.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (activeTab === 'calendar') {
      return renderCalendar();
    }

    if (activeTab === 'settings') {
      return (
        <div className="space-y-6">
          <h2 className="text-xl font-bold">Settings</h2>
          
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Global Reminder</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                  {user?.reminder_enabled ? <Bell className="w-5 h-5 text-indigo-500" /> : <BellOff className="w-5 h-5 text-slate-300" />}
                  <span className="font-semibold">Daily Reminder</span>
                </div>
                <div className="flex items-center gap-3">
                  {user?.reminder_enabled && (
                    <input 
                      type="time" 
                      value={user.reminder_time || '09:00'}
                      onChange={(e) => updateGlobalReminder(true, e.target.value)}
                      className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                  <button 
                    onClick={() => updateGlobalReminder(!user?.reminder_enabled, user?.reminder_time || '09:00')}
                    className={`text-xs font-bold px-4 py-2 rounded-full transition-all active:scale-95 ${
                      user?.reminder_enabled 
                      ? 'bg-red-50 text-red-600' 
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    }`}
                  >
                    {user?.reminder_enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Receive a notification via our Telegram bot to keep your streaks alive.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Manage Habits</h3>
            <div className="space-y-3">
              {habits.map((habit) => (
                <div key={habit.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <button 
                        onClick={() => setFocusHabit(habit.id)}
                        className={`p-1 rounded-md transition-colors ${habit.is_focus ? 'text-yellow-500' : 'text-slate-300 hover:text-yellow-500'}`}
                      >
                        <Star className={`w-5 h-5 ${habit.is_focus ? 'fill-yellow-500' : ''}`} />
                      </button>
                      {editingHabitId === habit.id ? (
                        <input 
                          autoFocus
                          type="text"
                          value={editingHabitName}
                          onChange={(e) => setEditingHabitName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && renameHabit(habit.id)}
                          className="flex-1 text-sm border-b-2 border-indigo-600 outline-none py-1"
                        />
                      ) : (
                        <span className={`font-bold ${habit.is_focus ? 'text-indigo-600' : 'text-slate-700'}`}>
                          {habit.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {editingHabitId === habit.id ? (
                        <button 
                          onClick={() => renameHabit(habit.id)}
                          className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                      ) : (
                        <button 
                          onClick={() => { setEditingHabitId(habit.id); setEditingHabitName(habit.name); }}
                          className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => deleteHabit(habit.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Account</h3>
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
          </section>

          <button 
            onClick={() => WebApp.showAlert('Habit Tracker v1.0.0')}
            className="w-full py-4 bg-white text-slate-600 rounded-xl font-medium border border-slate-100 shadow-sm"
          >
            App Version
          </button>
        </div>
      );
    }

    const changeDate = (days: number) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + days);
      const newDateStr = date.toISOString().split('T')[0];
      
      // Don't allow future dates
      if (newDateStr > new Date().toISOString().split('T')[0]) return;
      
      setSelectedDate(newDateStr);
      WebApp.HapticFeedback.impactOccurred('light');
    };

    const isToday = selectedDate === new Date().toISOString().split('T')[0];
    const displayDate = isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('default', { month: 'short', day: 'numeric' });

    return (
      <>
        <header className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{displayDate}</h1>
              <div className="flex gap-1 ml-2">
                <button onClick={() => changeDate(-1)} className="p-1 bg-white rounded-md border border-slate-100 shadow-sm active:scale-90 transition-transform">
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </button>
                {!isToday && (
                  <button onClick={() => changeDate(1)} className="p-1 bg-white rounded-md border border-slate-100 shadow-sm active:scale-90 transition-transform">
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-slate-500 text-sm">{isToday ? 'Keep the momentum going' : 'Log missed habits'}</p>
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
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => toggleHabit(focusHabit.id)}
                    className={`p-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all ${
                      completedToday.includes(focusHabit.id) 
                      ? 'bg-indigo-400 text-white' 
                      : 'bg-white text-indigo-600'
                    }`}
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    {completedToday.includes(focusHabit.id) ? 'Done' : 'Complete'}
                  </button>
                  {!completedToday.includes(focusHabit.id) && (
                    <button 
                      onClick={() => setIsAddingNote(focusHabit.id)}
                      className="text-indigo-200 text-xs font-bold flex items-center justify-center gap-1 hover:text-white transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Add Note
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Other Habits</h3>
        <div className="space-y-3">
          {otherHabits.map(habit => (
            <div key={habit.id} className="space-y-2">
              <div 
                onClick={() => toggleHabit(habit.id)}
                className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-slate-100 active:scale-[0.98] transition-transform cursor-pointer"
              >
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
                {!completedToday.includes(habit.id) && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsAddingNote(habit.id); }}
                    className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                )}
              </div>
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

      {isAddingNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Why was it missed?</h3>
              <button onClick={() => setIsAddingNote(null)} className="p-1 bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              autoFocus
              placeholder="Enter a reason..."
              className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none mb-4 min-h-[100px] text-sm"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <button 
              onClick={() => isAddingNote && saveNote(isAddingNote)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Save className="w-4 h-4" />
              Save Note
            </button>
          </div>
        </div>
      )}

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
          onClick={() => setActiveTab('calendar')}
          className={`p-3 rounded-xl transition-colors ${activeTab === 'calendar' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
        >
          <CalendarIcon className="w-6 h-6" />
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
