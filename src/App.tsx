import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { directus, Habit, User, Log } from './lib/directus';
import { readItems, createItem, updateItem, deleteItem } from '@directus/sdk';
import { CheckCircle2, Circle, Star, Trophy, Plus, Settings, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, Bell, BellOff, MessageSquare, Save, Pencil, Check, ChevronUp, ChevronDown, Sparkles, Heart, Share2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import axios from 'axios';

const getLevel = (xp: number) => Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);
const getXpForLevel = (level: number) => 50 * level * (level - 1);
const getXpToNextLevel = (level: number) => 100 * level;

const STREAK_BONUSES: Record<number, number> = {
  7: 20,
  14: 50,
  30: 150
};

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
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);

  const calculateStreak = (habitId: string | number, allLogs: Log[]) => {
    const habitLogs = allLogs
      .filter(l => l.habit_id === habitId && l.status === 'done')
      .map(l => l.date.split('T')[0])
      .sort((a, b) => b.localeCompare(a));

    if (habitLogs.length === 0) return 0;

    const uniqueDates = Array.from(new Set(habitLogs));
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // If the most recent log is not today or yesterday, the streak is broken
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterdayStr) {
      return 0;
    }

    let streak = 0;
    let currentDate = new Date(uniqueDates[0]);

    for (let i = 0; i < uniqueDates.length; i++) {
      const logDate = uniqueDates[i];
      const expectedDateStr = currentDate.toISOString().split('T')[0];

      if (logDate === expectedDateStr) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

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
        const startOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).toISOString().split('T')[0];

        const logs = await directus.request(readItems('logs', {
          filter: {
            _and: [
              { habit_id: { _eq: selectedHabitId } },
              { date: { _gte: startOfMonth } },
              { date: { _lte: endOfMonth } }
            ]
          } as any,
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
  }, [activeTab, selectedHabitId, calendarDate]);

  // Initial load: User only
  useEffect(() => {
    const loadUser = async () => {
      try {
        WebApp.ready();
        WebApp.expand();

        const tgUser = WebApp.initDataUnsafe.user;
        const telegramId = tgUser?.id.toString() || 'dev_user_123';
        const username = tgUser?.username || tgUser?.first_name || 'Dev User';
        const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        console.log('Fetching user:', telegramId);
        const users = await directus.request(readItems('users', {
          filter: { telegram_id: { _eq: telegramId } }
        }));

        let directusUser: User;
        if (users.length === 0) {
          const newUser = {
            telegram_id: telegramId,
            username: username,
            total_xp: 0,
            reminder_enabled: true,
            reminder_time: '20:00',
            timezone: currentTimezone,
            premium: false,
            donate: 0
          };
          directusUser = await directus.request(createItem('users', newUser)) as User;
        } else {
          directusUser = users[0];
          if (directusUser.timezone !== currentTimezone) {
            directusUser = await directus.request(updateItem('users', directusUser.id as any, {
              timezone: currentTimezone
            })) as User;
          }
        }
        setUser(directusUser);
      } catch (error: any) {
        console.error('Error loading user:', error);
        WebApp.showAlert(`Init Error: ${error.message}`);
      }
    };

    loadUser();
  }, []);

  // Fetch habits and logs when user or date changes
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const fetchedHabits = await directus.request(readItems('habits', {
          filter: { user_id: { _eq: user.id } },
          sort: ['sort'] as any
        }));

        const allLogs = await directus.request(readItems('logs', {
          filter: { 
            habit_id: { _in: fetchedHabits.map(h => h.id) as any[] },
            status: { _eq: 'done' }
          },
          limit: -1
        })) as Log[];

        const habitsWithStreaks = fetchedHabits.map(h => ({
          ...h,
          streak: calculateStreak(h.id, allLogs)
        }));

        setHabits(habitsWithStreaks as Habit[]);
        const userDateLogs = allLogs.filter(log => log.date === selectedDate);
        setCompletedToday(userDateLogs.map(log => log.habit_id));
      } catch (err) {
        console.error('Failed to fetch habits/logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, selectedDate]);

  const toggleHabit = async (habitId: string | number) => {
    if (!user) return;

    const isCompleted = completedToday.includes(habitId);
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    try {
      if (isCompleted) {
        // UNDO HABIT
        const logs = await directus.request(readItems('logs', {
          filter: {
            _and: [
              { habit_id: { _eq: habitId } },
              { date: { _eq: selectedDate } }
            ]
          }
        }));

        let xpToRemove = 0;
        for (const log of logs) {
          if (log.status === 'done') xpToRemove += log.xp_earned || 0;
          // @ts-ignore
          await directus.request(deleteItem('logs', log.id));
        }

        const wasDone = logs.some(l => l.status === 'done');
        if (wasDone) {
          const allLogs = await directus.request(readItems('logs', {
            filter: { habit_id: { _eq: habitId }, status: { _eq: 'done' } },
            limit: -1
          })) as Log[];
          
          const newStreak = calculateStreak(habitId, allLogs);
          await directus.request(updateItem('habits', habitId as any, { streak: newStreak }));
          setHabits(prev => prev.map(h => h.id === habitId ? { ...h, streak: newStreak } : h));
          
          await directus.request(updateItem('users', user.id as any, {
            total_xp: Math.max(0, (user.total_xp || 0) - xpToRemove)
          }));
          setUser(prev => prev ? { ...prev, total_xp: Math.max(0, (prev.total_xp || 0) - xpToRemove) } : null);
        }

        setCompletedToday(prev => prev.filter(id => id !== habitId));
        WebApp.HapticFeedback.notificationOccurred('warning');
      } else {
        // COMPLETE HABIT
        const baseXP = habit.is_focus ? 25 : 10;
        
        const allLogsBefore = await directus.request(readItems('logs', {
          filter: { habit_id: { _eq: habitId }, status: { _eq: 'done' } },
          limit: -1
        })) as Log[];
        
        const mockLogs = [...allLogsBefore, { date: selectedDate, status: 'done', habit_id: habitId } as Log];
        const newStreak = calculateStreak(habitId, mockLogs);
        
        let bonusXP = 0;
        if (STREAK_BONUSES[newStreak]) {
          const pastLogsWithBonus = await directus.request(readItems('logs', {
            filter: {
              _and: [
                { habit_id: { _eq: habitId } },
                { xp_earned: { _in: [25 + STREAK_BONUSES[newStreak], 10 + STREAK_BONUSES[newStreak]] } }
              ]
            } as any,
            limit: 1
          }));
          if (pastLogsWithBonus.length === 0) bonusXP = STREAK_BONUSES[newStreak];
        }

        const totalEarned = baseXP + bonusXP;

        await directus.request(createItem('logs', {
          habit_id: habitId as any,
          user_id: user.id as any,
          date: selectedDate,
          status: 'done',
          xp_earned: totalEarned
        }));

        await directus.request(updateItem('habits', habitId as any, { streak: newStreak }));
        setHabits(prev => prev.map(h => h.id === habitId ? { ...h, streak: newStreak } : h));

        const oldXP = user.total_xp || 0;
        const newXP = oldXP + totalEarned;
        const oldLevel = getLevel(oldXP);
        const currentLevel = getLevel(newXP);

        await directus.request(updateItem('users', user.id as any, { total_xp: newXP }));
        setUser(prev => prev ? { ...prev, total_xp: newXP } : null);
        setCompletedToday(prev => [...prev, habitId]);

        if (currentLevel > oldLevel) {
          setShowLevelUp(currentLevel);
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 }, colors: ['#4f46e5', '#818cf8', '#fbbf24'] });
        } else if (habit.is_focus || bonusXP > 0) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: bonusXP > 0 ? ['#fbbf24', '#f59e0b', '#fff'] : ['#4f46e5', '#818cf8', '#c7d2fe']
          });
        }
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
        user_id: user.id as any,
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
        streak: 0,
        sort: habits.length > 0 ? Math.max(...habits.map(h => Number(h.sort || 0))) + 1 : 1
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
          
          const habit = habits.find(h => h.id === habitId);
          const xpValue = habit?.is_focus ? 25 : 10;
          const xpToSubtract = logs.length * xpValue;

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
    } catch (error: any) {
      console.error('Error updating global reminder:', error);
      WebApp.showAlert('Failed to update reminder settings');
    }
  };

  const handleShare = () => {
    const shareText = "Check out this Telegram Habit Tracker! 📈 Simple, effective, and works right inside Telegram. @habitappw_bot";
    const fullUrl = `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
    WebApp.openTelegramLink(fullUrl);
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const handleSupport = async (starsAmount: number) => {
    if (!user) return;
    
    try {
      WebApp.MainButton.showProgress();
      // In production, this URL should be your actual backend URL
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/create-stars-invoice`
        : `http://localhost:3001/api/create-stars-invoice`;

      const response = await axios.post(apiUrl, {
        amount: starsAmount,
        userId: user.id
      });

      if (response.data.url) {
        WebApp.openInvoice(response.data.url, (status) => {
          if (status === 'paid') {
            WebApp.showAlert('Thank you for your support! 🌟');
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#fbbf24', '#f59e0b', '#fff']
            });
          }
        });
      }
    } catch (error) {
      console.error('Support error:', error);
      WebApp.showAlert('Failed to initiate support process');
    } finally {
      WebApp.MainButton.hideProgress();
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

  const moveHabit = async (habitId: string | number, direction: 'up' | 'down') => {
    const index = habits.findIndex(h => h.id === habitId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === habits.length - 1) return;

    const newHabits = [...habits];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap in local state
    [newHabits[index], newHabits[targetIndex]] = [newHabits[targetIndex], newHabits[index]];
    
    // Update sort values based on new positions
    const updatedHabits = newHabits.map((h, i) => ({ ...h, sort: i + 1 }));
    setHabits(updatedHabits);

    try {
      // Persist the new order to Directus
      // We only need to update the two habits that swapped, or all of them to be safe
      // Updating all ensures consistency
      await Promise.all(updatedHabits.map(h => 
        directus.request(updateItem('habits', h.id as any, { sort: h.sort }))
      ));
      
      WebApp.HapticFeedback.impactOccurred('light');
    } catch (error) {
      console.error('Error moving habit:', error);
      WebApp.showAlert('Failed to save new order');
    }
  };

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start

    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
    }

    const now = new Date();
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

    const monthName = calendarDate.toLocaleString('default', { month: 'long' });

    const selectedDayLog = habitLogs.find(l => l.date.startsWith(selectedCalendarDay || ''));

    const changeMonth = (offset: number) => {
      const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + offset, 1);
      setCalendarDate(newDate);
    };

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
              <button onClick={() => changeMonth(-1)} className="p-1 text-slate-400 hover:text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => changeMonth(1)} className="p-1 text-slate-400 hover:text-slate-600"><ChevronRight className="w-5 h-5" /></button>
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
                    <select 
                      value={user.reminder_time || '09:00'}
                      onChange={(e) => updateGlobalReminder(true, e.target.value)}
                      className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const hour = String(i).padStart(2, '0');
                        return (
                          <option key={hour} value={`${hour}:00`}>
                            {hour}:00
                          </option>
                        );
                      })}
                    </select>
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
                      <div className="flex flex-col">
                        <button 
                          onClick={() => moveHabit(habit.id, 'up')}
                          className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => moveHabit(habit.id, 'down')}
                          className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
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
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Spread the Word</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Share2 className="w-6 h-6 text-indigo-500" />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Invite Friends</h4>
              <p className="text-xs text-slate-400 mb-4">Help others build better habits too!</p>
              <button
                onClick={handleShare}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-indigo-100"
              >
                <Share2 className="w-4 h-4" />
                Share Bot
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Support Project</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
              <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Like the app?</h4>
              <p className="text-xs text-slate-400 mb-4">Support development with Telegram Stars</p>
              <div className="grid grid-cols-4 gap-2">
                {[5, 50, 500, 1000].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handleSupport(amount)}
                    className="py-2 px-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-sm font-bold transition-colors border border-indigo-100"
                  >
                    ⭐ {amount}
                  </button>
                ))}
              </div>
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
      
      const today = new Date().toISOString().split('T')[0];
      
      // Don't allow future dates
      if (newDateStr > today) return;

      // Limit to 7 days back
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      if (newDateStr < sevenDaysAgoStr) return;
      
      setSelectedDate(newDateStr);
      WebApp.HapticFeedback.impactOccurred('light');
    };

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const isToday = selectedDate === today;
    const isSevenDaysAgo = selectedDate <= sevenDaysAgoStr;
    const displayDate = isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('default', { month: 'short', day: 'numeric' });

    const currentXP = user?.total_xp || 0;
    const currentLevel = getLevel(currentXP);
    const xpForCurrentLevel = getXpForLevel(currentLevel);
    const xpForNextLevel = getXpForLevel(currentLevel + 1);
    const xpInLevel = currentXP - xpForCurrentLevel;
    const xpNeededForLevel = xpForNextLevel - xpForCurrentLevel;
    const progress = (xpInLevel / xpNeededForLevel) * 100;

    return (
      <>
        <header className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{displayDate}</h1>
              <div className="flex gap-1 ml-1">
                {!isSevenDaysAgo && (
                  <button onClick={() => changeDate(-1)} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </button>
                )}
                {!isToday && (
                  <button onClick={() => changeDate(1)} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-slate-500 text-sm">{isToday ? 'Keep the momentum going' : 'Log missed habits'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="font-bold text-slate-700">Lvl {currentLevel}</span>
              <span className="text-slate-300 mx-1">|</span>
              <span className="font-semibold text-slate-600">{currentXP} XP</span>
            </div>
          </div>
        </header>

        <section className="mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Level {currentLevel} Progress</span>
            </div>
            <span className="text-xs font-bold text-indigo-600">{xpInLevel} / {xpNeededForLevel} XP</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

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
                    <h4 className="font-semibold">
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

      {showLevelUp && (
        <div className="fixed inset-0 bg-indigo-600/95 flex items-center justify-center z-[100] p-6 animate-in fade-in zoom-in duration-300">
          <div className="text-center text-white">
            <div className="mb-6 relative inline-block">
              <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-bounce" />
              <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-white animate-pulse" />
            </div>
            <h2 className="text-4xl font-black mb-2 tracking-tight">LEVEL UP!</h2>
            <p className="text-indigo-100 text-lg mb-8 font-medium">You've reached Level {showLevelUp}</p>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-200 mb-1">New Milestone</p>
              <p className="text-xl font-bold">Keep crushing your goals!</p>
            </div>
            <button 
              onClick={() => setShowLevelUp(null)}
              className="px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase tracking-wider"
            >
              Continue Journey
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
