import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { directus, Habit, User, Log, Battle } from './lib/directus';
import { readItems, createItem, updateItem, deleteItem, deleteItems } from '@directus/sdk';
import { CheckCircle2, Circle, Star, Trophy, Plus, Settings, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, Bell, BellOff, MessageSquare, Save, Pencil, Check, ChevronUp, ChevronDown, Sparkles, Heart, Share2, Languages, Swords, ShieldAlert, User as UserIcon, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    document.dir = i18n.dir();
  }, [i18n.language]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [completedToday, setCompletedToday] = useState<(string | number)[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'calendar' | 'settings' | 'battle'>('today');
  const [selectedHabitId, setSelectedHabitId] = useState<string | number | null>(null);
  const [habitLogs, setHabitLogs] = useState<Log[]>([]);
  const [isAddingNote, setIsAddingNote] = useState<string | number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | number | null>(null);
  const [editingHabitName, setEditingHabitName] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);

  // Battle states
  const [battle, setBattle] = useState<Battle | null>(null);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [opponentTgId, setOpponentTgId] = useState('');
  const [isSearchingOpponent, setIsSearchingOpponent] = useState(false);
  const [opponentCompletedToday, setOpponentCompletedToday] = useState(false);
  const [battleHistory, setBattleHistory] = useState<(Battle & { opponent_name?: string })[]>([]);

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

  useEffect(() => {
    const loadUser = async () => {
      try {
        WebApp.ready();
        WebApp.expand();

        const tgUser = WebApp.initDataUnsafe.user;
        const telegramId = tgUser?.id.toString() || 'dev_user_123';
        const username = tgUser?.username || tgUser?.first_name || 'Dev User';
        const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const initialLang = tgUser?.language_code === 'ru' ? 'ru' : 'en';

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
            donate: 0,
            language: initialLang
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
        
        if (directusUser.language) {
          i18n.changeLanguage(directusUser.language);
        } else {
          await directus.request(updateItem('users', directusUser.id as any, {
            language: initialLang
          }));
          i18n.changeLanguage(initialLang);
        }
        
        setUser(directusUser);

        // Battle check
        const battles = await directus.request(readItems('battles', {
          filter: {
            _or: [
              { initiator_id: { _eq: directusUser.id } },
              { opponent_id: { _eq: directusUser.id } },
              { opponent_tg_id: { _eq: telegramId } }
            ],
            status: { _in: ['pending', 'active'] }
          } as any
        }));

        if (battles.length > 0) {
          const b = battles[0] as Battle;
          if (!b.opponent_id && b.opponent_tg_id === telegramId) {
            await directus.request(updateItem('battles', b.id as any, { opponent_id: directusUser.id }));
            b.opponent_id = directusUser.id;
          }
          setBattle(b);
          
          const oppId = b.initiator_id === directusUser.id ? b.opponent_id : b.initiator_id;
          if (oppId) {
            const opps = await directus.request(readItems('users', { filter: { id: { _eq: oppId } } }));
            if (opps.length > 0) setOpponent(opps[0] as User);
          }
        }
      } catch (error: any) {
        console.error('Error loading user:', error);
        WebApp.showAlert(`Init Error: ${error.message}`);
      }
    };

    loadUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch latest battle status
        const battles = await directus.request(readItems('battles', {
          filter: {
            _or: [
              { initiator_id: { _eq: user.id } },
              { opponent_id: { _eq: user.id } },
              { opponent_tg_id: { _eq: user.telegram_id } }
            ],
            status: { _in: ['pending', 'active'] }
          } as any
        }));

        let latestBattle: Battle | null = null;
        if (battles.length > 0) {
          latestBattle = battles[0] as Battle;
          // Auto-assign opponent_id if it's missing (invitation accepted via bot or just joined)
          if (!latestBattle.opponent_id && latestBattle.opponent_tg_id === user.telegram_id) {
            await directus.request(updateItem('battles', latestBattle.id as any, { opponent_id: user.id }));
            latestBattle.opponent_id = user.id;
          }
          
          if (JSON.stringify(latestBattle) !== JSON.stringify(battle)) {
            setBattle(latestBattle);
          }
          
          const oppId = latestBattle.initiator_id === user.id ? latestBattle.opponent_id : latestBattle.initiator_id;
          if (oppId && (!opponent || opponent.id !== oppId)) {
            const opps = await directus.request(readItems('users', { filter: { id: { _eq: oppId } } }));
            if (opps.length > 0) setOpponent(opps[0] as User);
          }
        } else if (battle) {
          setBattle(null);
          setOpponent(null);
        }

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

        if (latestBattle && latestBattle.status === 'active') {
          const isInitiator = latestBattle.initiator_id === user.id;
          const oppHabitId = isInitiator ? latestBattle.opponent_habit_id : latestBattle.initiator_habit_id;
          
          if (oppHabitId) {
            const oppLogs = await directus.request(readItems('logs', {
              filter: {
                habit_id: { _eq: oppHabitId },
                date: { _eq: selectedDate },
                status: { _eq: 'done' }
              } as any
            }));
            setOpponentCompletedToday(oppLogs.length > 0);
          } else {
            setOpponentCompletedToday(false);
          }
        } else {
          setOpponentCompletedToday(false);
        }

        // Fetch battle history
        const history = await directus.request(readItems('battles', {
          filter: {
            _and: [
              { _or: [{ initiator_id: { _eq: user.id } }, { opponent_id: { _eq: user.id } }] },
              { status: { _eq: 'finished' } }
            ]
          } as any,
          sort: ['-ended_at'] as any,
          limit: 10
        })) as Battle[];

        const historyWithNames = await Promise.all(history.map(async (b) => {
          const oppId = b.initiator_id === user.id ? b.opponent_id : b.initiator_id;
          if (oppId) {
            const opps = await directus.request(readItems('users', { filter: { id: { _eq: oppId } } }));
            return { ...b, opponent_name: opps[0]?.username || 'Unknown' };
          }
          return b;
        }));
        setBattleHistory(historyWithNames);
      } catch (err) {
        console.error('Failed to fetch habits/logs/battle:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, selectedDate, activeTab]);

  const toggleHabit = async (habitId: string | number) => {
    if (!user) return;

    const isCompleted = completedToday.includes(habitId);
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    try {
      if (isCompleted) {
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
      const msg = error.errors?.[0]?.message || error.message || 'Unknown error';
      WebApp.showAlert(`Failed to add habit: ${msg}`);
    }
  };

  const setFocusHabit = async (habitId: string | number) => {
    if (!user) return;
    if (battle && battle.status === 'active') {
      WebApp.showAlert(t('battle.noFocusHabit'));
      return;
    }
    try {
      const currentFocus = habits.find(h => h.is_focus);
      if (currentFocus) {
        await directus.request(updateItem('habits', currentFocus.id as any, { is_focus: false }));
      }
      await directus.request(updateItem('habits', habitId as any, { is_focus: true }));
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
          const logs = await directus.request(readItems('logs', {
            filter: { habit_id: { _eq: habitId } },
            limit: -1
          })) as Log[];
          
          const xpToSubtract = logs.reduce((acc, log) => acc + (log.xp_earned || 0), 0);

          if (logs.length > 0) {
            const logIds = logs.map(l => l.id) as any[];
            await directus.request(deleteItems('logs', logIds));
          }

          await directus.request(updateItem('users', user.id as any, {
            total_xp: Math.max(0, (user.total_xp || 0) - xpToSubtract)
          }));

          // @ts-ignore
          await directus.request(deleteItem('habits', habitId));
          
          setHabits(prev => prev.filter(h => String(h.id) !== String(habitId)));
          setUser(prev => prev ? { ...prev, total_xp: Math.max(0, (prev.total_xp || 0) - xpToSubtract) } : null);
          
          if (String(selectedHabitId) === String(habitId)) {
            const remainingHabits = habits.filter(h => String(h.id) !== String(habitId));
            setSelectedHabitId(remainingHabits.length > 0 ? remainingHabits[0].id : null);
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

  const handleShare = (customText?: string) => {
    const shareText = typeof customText === 'string' ? customText : t('settings.shareText');
    const botUrl = "https://t.me/habitappw_bot";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botUrl)}&text=${encodeURIComponent(shareText)}`;
    
    WebApp.openTelegramLink(shareUrl);
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const startBattle = async () => {
    const username = opponentTgId.trim().replace('@', '');
    if (!user || !username) return;
    const focus = habits.find(h => h.is_focus);
    if (!focus) {
      WebApp.showAlert(t('battle.noFocusHabit'));
      return;
    }

    setIsSearchingOpponent(true);
    try {
      const opps = await directus.request(readItems('users', {
        filter: {
          username: { _icontains: username }
        }
      }));

      const targetOpponent = opps.find(o => o.username.toLowerCase() === username.toLowerCase());

      if (targetOpponent) {
        if (!targetOpponent.premium) {
          WebApp.showAlert(t('battle.opponentNotPremium'));
          return;
        }

        // Check if opponent already in battle
        const activeBattles = await directus.request(readItems('battles', {
          filter: {
            _and: [
              { _or: [{ initiator_id: { _eq: targetOpponent.id } }, { opponent_id: { _eq: targetOpponent.id } }, { opponent_tg_id: { _eq: targetOpponent.telegram_id } }] },
              { status: { _in: ['pending', 'active'] } }
            ]
          } as any
        }));

        if (activeBattles.length > 0) {
          WebApp.showAlert(t('battle.opponentBusy'));
          return;
        }

        const newBattle = await directus.request(createItem('battles', {
          initiator_id: user.id,
          opponent_id: targetOpponent.id,
          opponent_tg_id: targetOpponent.telegram_id,
          status: 'pending',
          initiator_habit_id: focus.id,
          initiator_habit_name: focus.name,
          created_at: new Date().toISOString()
        })) as Battle;
        
        setBattle(newBattle);
        setOpponent(targetOpponent);
        
        // Send bot notification
        const apiUrl = import.meta.env.PROD ? '/api/battle-notification' : 'http://localhost:3001/api/battle-notification';
        await axios.post(apiUrl, {
          targetTgId: targetOpponent.telegram_id,
          initiatorName: user.username,
          language: targetOpponent.language || 'en'
        });

        WebApp.showAlert('Invitation sent!');
      } else {
        handleShare(t('battle.inviteText'));
      }
    } catch (error) {
      console.error('Error starting battle:', error);
      WebApp.showAlert('Failed to initiate battle');
    } finally {
      setIsSearchingOpponent(false);
    }
  };

  const respondToBattle = async (accept: boolean) => {
    if (!battle || !user) return;
    try {
      if (accept) {
        const focus = habits.find(h => h.is_focus);
        if (!focus) {
          WebApp.showAlert(t('battle.noFocusHabit'));
          return;
        }
        const updated = await directus.request(updateItem('battles', battle.id as any, {
          status: 'active',
          opponent_habit_id: focus.id,
          opponent_habit_name: focus.name,
          started_at: new Date().toISOString()
        })) as Battle;
        setBattle(updated);
      } else {
        await directus.request(updateItem('battles', battle.id as any, { status: 'declined' }));
        setBattle(null);
        setOpponent(null);
      }
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error('Error responding to battle:', error);
    }
  };

  const cancelBattle = async () => {
    if (!battle) return;
    try {
      await directus.request(updateItem('battles', battle.id as any, { status: 'cancelled' }));
      setBattle(null);
      setOpponent(null);
      WebApp.HapticFeedback.notificationOccurred('warning');
    } catch (error) {
      console.error('Error cancelling battle:', error);
    }
  };

  const renderHistory = () => {
    if (battleHistory.length === 0) {
      return (
        <section className="mt-8 text-center p-8 bg-white rounded-3xl border-2 border-dashed border-slate-100">
          <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{t('battle.startFirst')}</p>
        </section>
      );
    }
    return (
      <section className="mt-8">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{t('battle.history')}</h3>
        <div className="space-y-3">
          {battleHistory.map((h) => {
            const isWinner = h.winner_id === user?.id;
            const isDraw = !h.winner_id && !h.loser_id;
            const start = new Date(h.started_at || h.created_at);
            const end = new Date(h.ended_at!);
            const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            
            return (
              <div key={h.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isWinner ? 'bg-green-100 text-green-600' : isDraw ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'}`}>
                    {isWinner ? <Trophy className="w-5 h-5" /> : isDraw ? <Swords className="w-5 h-5" /> : <X className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">@{h.opponent_name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">{days} {t('today.days')}</p>
                  </div>
                </div>
                <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${isWinner ? 'bg-green-500 text-white' : isDraw ? 'bg-slate-200 text-slate-600' : 'bg-red-500 text-white'}`}>
                  {isWinner ? t('battle.victory').split('!')[0].toUpperCase() : isDraw ? t('battle.draw').split('!')[0].toUpperCase() : t('battle.defeat').split('!')[0].toUpperCase()}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const surrenderBattle = async () => {
    if (!battle || !user || !opponent) return;
    WebApp.showConfirm(t('battle.surrenderConfirm'), async (confirmed) => {
      if (confirmed) {
        try {
          await directus.request(updateItem('battles', battle.id as any, {
            status: 'finished',
            winner_id: opponent.id,
            loser_id: user.id,
            ended_at: new Date().toISOString()
          }));
          
          // XP changes
          await directus.request(updateItem('users', user.id as any, {
            total_xp: Math.max(0, (user.total_xp || 0) - 50)
          }));
          await directus.request(updateItem('users', opponent.id as any, {
            total_xp: (opponent.total_xp || 0) + 100
          }));
          
          setUser(prev => prev ? { ...prev, total_xp: Math.max(0, (prev.total_xp || 0) - 50) } : null);
          setBattle(null);
          setOpponent(null);
          WebApp.HapticFeedback.notificationOccurred('warning');
          WebApp.showAlert(t('battle.surrenderAlert'));
        } catch (error) {
          console.error('Error surrendering battle:', error);
        }
      }
    });
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

  const changeLanguage = async (lang: string) => {
    if (!user) return;
    try {
      await directus.request(updateItem('users', user.id as any, { language: lang }));
      i18n.changeLanguage(lang);
      setUser(prev => prev ? { ...prev, language: lang } : null);
      WebApp.HapticFeedback.impactOccurred('medium');
    } catch (error) {
      console.error('Error changing language:', error);
      WebApp.showAlert('Failed to update language');
    }
  };

  const moveHabit = async (habitId: string | number, direction: 'up' | 'down') => {
    const index = habits.findIndex(h => h.id === habitId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === habits.length - 1) return;

    const newHabits = [...habits];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newHabits[index], newHabits[targetIndex]] = [newHabits[targetIndex], newHabits[index]];
    const updatedHabits = newHabits.map((h, i) => ({ ...h, sort: i + 1 }));
    setHabits(updatedHabits);

    try {
      await Promise.all(updatedHabits.map(h => 
        directus.request(updateItem('habits', h.id as any, { sort: h.sort }))
      ));
      WebApp.HapticFeedback.impactOccurred('light');
    } catch (error) {
      console.error('Error moving habit:', error);
      WebApp.showAlert('Failed to save new order');
    }
  };

  const handleSupport = async (starsAmount: number) => {
    if (!user) return;
    try {
      WebApp.MainButton.showProgress();
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
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#fbbf24', '#f59e0b', '#fff'] });
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

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;

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

    return (
      <div className="space-y-6">
        <header className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{t('progress.title')}</h2>
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
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-1 text-slate-400 hover:text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-1 text-slate-400 hover:text-slate-600"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(day => (<div key={day} className="text-center text-xs font-bold text-slate-400">{day}</div>))}
          </div>
          <div className="grid grid-cols-7 gap-2">{days}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">{t('progress.habitXpMonth')}</p>
            <p className="text-2xl font-bold text-indigo-600">{habitLogs.filter(l => l.status === 'done').length * 10}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">{t('progress.daysDone')}</p>
            <p className="text-2xl font-bold text-green-600">{habitLogs.filter(l => l.status === 'done').length}</p>
          </div>
        </div>
        {selectedCalendarDay && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-slate-800">{new Date(selectedCalendarDay).toLocaleDateString('default', { month: 'short', day: 'numeric' })}</h4>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${selectedDayLog?.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {selectedDayLog?.status === 'done' ? t('common.complete') : t('common.missed')}
              </span>
            </div>
            {selectedDayLog?.note ? <p className="text-slate-600 text-sm italic">"{selectedDayLog.note}"</p> : <p className="text-slate-400 text-sm">{t('progress.noNotes')}</p>}
          </div>
        )}
      </div>
    );
  };

  const renderBattle = () => {
    if (!user?.premium) {
      return (
        <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6 px-6 animate-in fade-in zoom-in-95">
          <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center"><Swords className="w-12 h-12 text-slate-300" /></div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('battle.comingSoon')}</h2>
            <p className="text-slate-500 leading-relaxed">{t('battle.premiumOnly')}</p>
          </div>
          <button onClick={() => setActiveTab('settings')} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-indigo-100">
            {t('tabs.settings')}
          </button>
        </div>
      );
    }
    if (!battle) {
      return (
        <div className="space-y-6 pb-12">
          <header className="flex items-center gap-3"><Swords className="w-8 h-8 text-indigo-600" /><h2 className="text-2xl font-bold">{t('battle.title')}</h2></header>
          <section className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg">
            <h3 className="text-lg font-bold mb-4">{t('battle.invite')}</h3>
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-200 font-bold">@</span>
                <input 
                  type="text" 
                  placeholder={t('battle.invitePlaceholder')} 
                  className="w-full bg-indigo-500/50 border border-indigo-400 rounded-xl pl-9 pr-4 py-3 text-white placeholder:text-indigo-200 outline-none" 
                  value={opponentTgId} 
                  onChange={(e) => setOpponentTgId(e.target.value.replace('@', ''))} 
                />
              </div>
              <button onClick={startBattle} disabled={isSearchingOpponent} className="w-full bg-white text-indigo-600 py-3 rounded-xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {isSearchingOpponent ? t('common.loading') : t('battle.start')}<Swords className="w-4 h-4" />
              </button>
            </div>
          </section>
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-indigo-500" />{t('battle.rules')}</h3>
            <ul className="space-y-3 text-sm text-slate-600">
              <li>1. {t('battle.rule1')}</li>
              <li>2. {t('battle.rule2')}</li>
              <li>3. {t('battle.rule3')}</li>
              <li>4. {t('battle.rule4')}</li>
              <li>5. {t('battle.rule5')}</li>
            </ul>
          </section>
          {renderHistory()}
        </div>
      );
    }
    if (battle.status === 'pending') {
      const isInitiator = battle.initiator_id === user?.id;
      return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 pb-12">
          <div className="flex flex-col items-center justify-center pt-12 text-center space-y-6">
            <div className="relative"><div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center animate-pulse"><Swords className="w-12 h-12 text-indigo-600" /></div><div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full border-2 border-white" /></div>
            <div><h3 className="text-xl font-bold text-slate-800">{isInitiator ? t('battle.pending') : t('battle.inviteNotification', { username: opponent?.username || 'Somebody' })}</h3></div>
            {!isInitiator ? (
              <div className="flex gap-4 w-full px-6">
                <button onClick={() => respondToBattle(false)} className="flex-1 py-4 bg-slate-200 text-slate-700 rounded-2xl font-bold active:scale-95 transition-all">{t('battle.decline')}</button>
                <button onClick={() => respondToBattle(true)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-indigo-200">{t('battle.accept')}</button>
              </div>
            ) : (
              <button onClick={cancelBattle} className="py-3 px-8 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-colors">{t('battle.cancel')}</button>
            )}
          </div>
          {renderHistory()}
        </div>
      );
    }
    if (battle.status === 'active') {
      const userHabitName = battle.initiator_id === user?.id ? battle.initiator_habit_name : battle.opponent_habit_name;
      const oppHabitName = battle.initiator_id === user?.id ? battle.opponent_habit_name : battle.initiator_habit_name;
      const userDone = completedToday.includes(battle.initiator_id === user?.id ? battle.initiator_habit_id : battle.opponent_habit_id!);
      
      const startDate = battle.started_at ? new Date(battle.started_at) : new Date(battle.created_at);
      const daysActive = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      return (
        <div className="space-y-6">
          <header className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center shadow-inner">
                <Swords className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight leading-none text-slate-800">{t('battle.active')}</h2>
                <p className="text-xs font-bold text-indigo-600 mt-1 uppercase tracking-widest">{t('battle.day')} {daysActive}</p>
              </div>
            </div>
            <div className="bg-red-500 px-3 py-1 rounded-full animate-pulse shadow-lg shadow-red-100"><span className="text-white text-[10px] font-black tracking-tighter">LIVE</span></div>
          </header>

          <div className="space-y-3">
            {/* User Card */}
            <div key="user-card" className={`relative p-5 rounded-3xl border-2 transition-all ${userDone ? 'bg-green-100 border-green-300' : 'bg-white border-slate-100 shadow-sm'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm"><UserIcon className="w-5 h-5 text-indigo-600" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('battle.you')}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-slate-800">@{user?.username}</p>
                      {user?.premium && (
                        <div className="bg-gradient-to-br from-amber-300 to-amber-600 p-0.5 rounded-full">
                          <Crown className="w-2.5 h-2.5 text-white fill-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-[10px] font-black px-3 py-1.5 rounded-full ${userDone ? 'bg-green-500 text-white shadow-md shadow-green-100' : 'bg-slate-100 text-slate-400'}`}>
                  {userDone ? t('common.done').toUpperCase() : t('common.missed').toUpperCase()}
                </div>
              </div>
              <div className="bg-white/50 rounded-2xl p-4 border border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">{t('today.focusHabit')}</p>
                <h4 className="font-bold text-slate-800 leading-tight">{userHabitName}</h4>
              </div>
            </div>

            {/* Opponent Card */}
            <div key="opponent-card" className={`relative p-5 rounded-3xl border-2 transition-all ${opponentCompletedToday ? 'bg-green-100 border-green-300' : 'bg-white border-slate-100 shadow-sm'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm"><ShieldAlert className="w-5 h-5 text-red-600" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('battle.opponent')}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-slate-800">@{opponent?.username || 'Somebody'}</p>
                      {opponent?.premium && (
                        <div className="bg-gradient-to-br from-amber-300 to-amber-600 p-0.5 rounded-full">
                          <Crown className="w-2.5 h-2.5 text-white fill-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`text-[10px] font-black px-3 py-1.5 rounded-full ${opponentCompletedToday ? 'bg-green-500 text-white shadow-md shadow-green-100' : 'bg-slate-100 text-slate-400'}`}>
                  {opponentCompletedToday ? t('common.done').toUpperCase() : t('common.missed').toUpperCase()}
                </div>
              </div>
              <div className="bg-white/50 rounded-2xl p-4 border border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">{t('today.focusHabit')}</p>
                <h4 className="font-bold text-slate-800 leading-tight">{oppHabitName}</h4>
              </div>
            </div>
          </div>

          <button onClick={surrenderBattle} className="w-full py-4 text-red-500 text-sm font-bold hover:bg-red-50 rounded-2xl transition-colors">
            {t('battle.surrender')}
          </button>

          {battleHistory.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{t('battle.history')}</h3>
              <div className="space-y-3">
                {battleHistory.map((h) => {
                  const isWinner = h.winner_id === user?.id;
                  const isDraw = !h.winner_id && !h.loser_id;
                  const start = new Date(h.started_at || h.created_at);
                  const end = new Date(h.ended_at!);
                  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                  
                  return (
                    <div key={h.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isWinner ? 'bg-green-100 text-green-600' : isDraw ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'}`}>
                          {isWinner ? <Trophy className="w-5 h-5" /> : isDraw ? <Swords className="w-5 h-5" /> : <X className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">@{h.opponent_name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">{days} {t('today.days')}</p>
                        </div>
                      </div>
                      <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${isWinner ? 'bg-green-500 text-white' : isDraw ? 'bg-slate-200 text-slate-600' : 'bg-red-500 text-white'}`}>
                        {isWinner ? t('battle.victory').split('!')[0].toUpperCase() : isDraw ? t('battle.draw').split('!')[0].toUpperCase() : t('battle.defeat').split('!')[0].toUpperCase()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      );
    }
    return null;
  };

  const focusHabit = habits.find(h => h.is_focus);
  const otherHabits = habits.filter(h => !h.is_focus);

  const renderContent = () => {
    if (activeTab === 'calendar') return renderCalendar();
    if (activeTab === 'settings') {
      return (
        <div className="space-y-6">
          <h2 className="text-xl font-bold">{t('settings.title')}</h2>
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.globalReminder')}</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">{user?.reminder_enabled ? <Bell className="w-5 h-5 text-indigo-500" /> : <BellOff className="w-5 h-5 text-slate-300" />}<span className="font-semibold">{t('settings.dailyReminder')}</span></div>
                <div className="flex items-center gap-3">
                  {user?.reminder_enabled && (
                    <select value={user.reminder_time || '09:00'} onChange={(e) => updateGlobalReminder(true, e.target.value)} className="text-sm border border-slate-200 rounded px-2 py-1 outline-none bg-white">
                      {Array.from({ length: 24 }).map((_, i) => { const hour = String(i).padStart(2, '0'); return <option key={hour} value={`${hour}:00`}>{hour}:00</option>; })}
                    </select>
                  )}
                  <button onClick={() => updateGlobalReminder(!user?.reminder_enabled, user?.reminder_time || '09:00')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all active:scale-95 ${user?.reminder_enabled ? 'bg-red-50 text-red-600' : 'bg-indigo-600 text-white shadow-md shadow-indigo-100'}`}>
                    {user?.reminder_enabled ? t('common.cancel') : t('common.done')}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">{t('settings.reminderDesc')}</p>
            </div>
          </section>
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.language')}</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700"><Languages className="w-5 h-5 text-indigo-500" /><span className="font-semibold">{t('settings.language')}</span></div>
                <select value={i18n.language} onChange={(e) => changeLanguage(e.target.value)} className="text-sm border border-slate-200 rounded px-2 py-1 outline-none bg-white">
                  <option value="en">English</option><option value="ru">Русский</option><option value="ar">العربية</option><option value="es">Español</option><option value="id">Bahasa Indonesia</option><option value="fa">فارسی</option><option value="uk">Українська</option><option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          </section>
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.manageHabits')}</h3>
            <div className="space-y-3">
              {habits.map((habit) => (
                <div key={habit.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <button onClick={() => setFocusHabit(habit.id)} className={`p-1 rounded-md transition-colors ${habit.is_focus ? 'text-yellow-500' : 'text-slate-300 hover:text-yellow-500'}`}><Star className={`w-5 h-5 ${habit.is_focus ? 'fill-yellow-500' : ''}`} /></button>
                      {editingHabitId === habit.id ? (
                        <input autoFocus type="text" value={editingHabitName} onChange={(e) => setEditingHabitName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renameHabit(habit.id)} className="flex-1 text-sm border-b-2 border-indigo-600 outline-none py-1" />
                      ) : (
                        <span className={`font-bold ${habit.is_focus ? 'text-indigo-600' : 'text-slate-700'}`}>{habit.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col">
                        <button onClick={() => moveHabit(habit.id, 'up')} className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => moveHabit(habit.id, 'down')} className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"><ChevronDown className="w-4 h-4" /></button>
                      </div>
                      {editingHabitId === habit.id ? (
                        <button onClick={() => renameHabit(habit.id)} className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors"><Check className="w-5 h-5" /></button>
                      ) : (
                        <button onClick={() => { setEditingHabitId(habit.id); setEditingHabitName(habit.name); }} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => deleteHabit(habit.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.spreadWord')}</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-6 h-6 text-indigo-500 fill-indigo-500" />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">{t('settings.inviteFriends')}</h4>
              <p className="text-xs text-slate-400 mb-4">{t('settings.inviteDesc')}</p>
              <button onClick={() => handleShare()} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-indigo-100">
                <Share2 className="w-4 h-4" />{t('settings.shareBot')}
              </button>
            </div>
          </section>
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.supportProject')}</h3>
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <Sparkles className="absolute -right-2 -top-2 w-16 h-16 text-white/20 rotate-12" />
              <h4 className="font-bold mb-1 flex items-center gap-2">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />{t('settings.likeApp')}
              </h4>
              <p className="text-xs text-indigo-100 mb-4">{t('settings.supportDesc')}</p>
              <div className="grid grid-cols-3 gap-2">
                {[50, 100, 250].map(amount => (
                  <button key={amount} onClick={() => handleSupport(amount)} className="py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-colors">
                    {amount} ⭐️
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="pb-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('settings.account')}</h3>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              <div className="p-4 flex justify-between items-center">
                <span className="text-sm text-slate-600">{t('settings.username')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">@{user?.username}</span>
                  {user?.premium && (
                    <div className="bg-gradient-to-br from-amber-300 to-amber-600 p-1 rounded-full shadow-sm">
                      <Crown className="w-3 h-3 text-white fill-white" />
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 flex justify-between items-center">
                <span className="text-sm text-slate-600">{t('settings.telegramId')}</span>
                <span className="text-sm font-mono text-slate-500">{user?.telegram_id}</span>
              </div>
              <div className="p-4 flex justify-between items-center">
                <span className="text-sm text-slate-600">{t('settings.appVersion')}</span>
                <span className="text-sm text-slate-400">1.2.5-stable</span>
              </div>
            </div>
          </section>
        </div>
      );
    }
    if (activeTab === 'battle') return renderBattle();

    const isToday = selectedDate === new Date().toISOString().split('T')[0];
    const currentXP = user?.total_xp || 0;
    const currentLevel = getLevel(currentXP);
    const nextLevelXP = getXpForLevel(currentLevel + 1);
    const xpRemaining = nextLevelXP - currentXP;
    const progress = ((currentXP - getXpForLevel(currentLevel)) / (nextLevelXP - getXpForLevel(currentLevel))) * 100;

    return (
      <>
        <header className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{isToday ? t('common.today') : new Date(selectedDate).toLocaleDateString('default', { month: 'short', day: 'numeric' })}</h1>
              <div className="flex gap-1 ml-1">
                <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); WebApp.HapticFeedback.impactOccurred('light'); }} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronLeft className="w-4 h-4 text-slate-400" /></button>
                {!isToday && <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); WebApp.HapticFeedback.impactOccurred('light'); }} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><ChevronRight className="w-4 h-4 text-slate-400" /></button>}
              </div>
            </div>
            <p className="text-slate-500 text-sm">{isToday ? t('today.momentum') : t('today.logMissed')}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
              <Trophy className="w-4 h-4 text-yellow-500" /><span className="font-bold text-slate-700 text-sm">Lvl {currentLevel}</span>
              <span className="text-slate-300 mx-1">|</span><span className="font-semibold text-slate-600 text-sm">{currentXP} XP</span>
            </div>
            <div className="w-36"><div className="h-2 bg-slate-200/50 rounded-full overflow-hidden p-[1px] border border-slate-100 shadow-inner"><div className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 rounded-full transition-all duration-1000 ease-out shadow-sm" style={{ width: `${progress}%` }} /></div></div>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t('progress.xpRemaining', { xp: xpRemaining })}</p>
          </div>
        </header>

        {focusHabit && (
          <section className="mb-8">
            <div className={`${completedToday.includes(focusHabit.id) ? 'bg-indigo-600' : 'bg-indigo-400'} rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden transition-colors duration-300`}>
              {user?.premium && (
                <div className="absolute top-4 right-4 bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-xl flex items-center gap-1 z-20 border border-amber-200/50 animate-in fade-in slide-in-from-top-2 duration-500">
                  <Crown className="w-3 h-3 fill-white" />
                  <span className="tracking-wider">PREMIUM</span>
                </div>
              )}
              <Star className="absolute -right-4 -top-4 w-24 h-24 text-indigo-500 opacity-50" />
              <div className="relative z-10">
                <span className="text-indigo-200 text-xs font-bold uppercase tracking-wider">{t('today.focusHabit')}</span>
                <h2 className="text-2xl font-bold mt-1 mb-4">{focusHabit.name}</h2>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col"><span className="text-indigo-100 text-sm">{t('today.currentStreak')}</span><span className="text-2xl font-bold">{focusHabit.streak} {t('today.days')}</span></div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => toggleHabit(focusHabit.id)} className={`p-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all ${completedToday.includes(focusHabit.id) ? 'bg-indigo-400 text-white' : 'bg-white text-indigo-400'}`}>
                      <CheckCircle2 className="w-6 h-6" />{completedToday.includes(focusHabit.id) ? t('common.done') : t('common.complete')}
                    </button>
                    {!completedToday.includes(focusHabit.id) && <button onClick={() => setIsAddingNote(focusHabit.id)} className="text-indigo-200 text-xs font-bold flex items-center justify-center gap-1 hover:text-white transition-colors"><MessageSquare className="w-3 h-3" />{t('notes.save')}</button>}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mb-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{t('today.otherHabits')}</h3>
          <div className="space-y-3">
            {otherHabits.map(habit => (
              <div key={habit.id} className="space-y-2">
                <div onClick={() => toggleHabit(habit.id)} className={`${completedToday.includes(habit.id) ? 'bg-green-100 border-green-300' : 'bg-white border-slate-100'} p-4 rounded-xl flex items-center justify-between shadow-sm border active:scale-[0.98] transition-all cursor-pointer`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">{completedToday.includes(habit.id) ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300" />}</div>
                    <div><h4 className="font-semibold">{habit.name}</h4><p className="text-xs text-slate-400">{habit.streak} {t('today.days')}</p></div>
                  </div>
                  {!completedToday.includes(habit.id) && <button onClick={(e) => { e.stopPropagation(); setIsAddingNote(habit.id); }} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><MessageSquare className="w-5 h-5" /></button>}
                </div>
              </div>
            ))}
            <button onClick={() => setIsAddingHabit(true)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors">
              <Plus className="w-5 h-5" />{t('today.addHabit')}
            </button>
          </div>
        </section>

        {isAddingNote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-slate-800">{t('notes.title')}</h3><button onClick={() => setIsAddingNote(null)} className="p-1 bg-slate-100 rounded-full"><X className="w-4 h-4" /></button></div>
              <textarea autoFocus placeholder={t('notes.placeholder')} className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none mb-4 min-h-[100px] text-sm" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button onClick={() => isAddingNote && saveNote(isAddingNote)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"><Save className="w-4 h-4" />{t('notes.save')}</button>
            </div>
          </div>
        )}

        {isAddingHabit && (
          <div className="fixed inset-0 bg-black/50 flex items-end z-50">
            <div className="bg-white w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom">
              <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">{t('habits.newHabit')}</h3><button onClick={() => setIsAddingHabit(false)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button></div>
              <input autoFocus type="text" placeholder={t('habits.placeholder')} className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-600 outline-none mb-6" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} />
              <button onClick={addHabit} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform">{t('habits.create')}</button>
            </div>
          </div>
        )}
      </>
    );
  };

  const hasBattleNotification = battle?.status === 'pending' && battle.opponent_id === user?.id;

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 font-sans text-slate-900">
      {renderContent()}

      <nav className="fixed bottom-6 left-4 right-4 bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl p-2 flex justify-around shadow-lg z-40">
        <button onClick={() => setActiveTab('today')} className={`p-3 rounded-xl transition-colors ${activeTab === 'today' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}><CheckCircle2 className="w-6 h-6" /></button>
        <button onClick={() => setActiveTab('calendar')} className={`p-3 rounded-xl transition-colors ${activeTab === 'calendar' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}><CalendarIcon className="w-6 h-6" /></button>
        <button onClick={() => setActiveTab('battle')} className={`p-3 rounded-xl transition-colors relative ${activeTab === 'battle' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'} ${!user?.premium ? 'opacity-40 grayscale' : ''}`}>
          <Swords className="w-6 h-6" />
          {hasBattleNotification && <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-bounce" />}
        </button>
        <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-xl transition-colors ${activeTab === 'settings' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}><Settings className="w-6 h-6" /></button>
      </nav>

      {showLevelUp && (
        <div className="fixed inset-0 bg-indigo-600/95 flex items-center justify-center z-[100] p-6 animate-in fade-in zoom-in duration-300">
          <div className="text-center text-white">
            <div className="mb-6 relative inline-block"><Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-bounce" /><Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-white animate-pulse" /></div>
            <h2 className="text-4xl font-black mb-2 tracking-tight">{t('levelUp.title')}</h2>
            <p className="text-indigo-100 text-lg mb-8 font-medium">{t('levelUp.reached', { level: showLevelUp })}</p>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20"><p className="text-sm font-bold uppercase tracking-widest text-indigo-200 mb-1">{t('levelUp.milestone')}</p><p className="text-xl font-bold">{t('levelUp.keepCrushing')}</p></div>
            <button onClick={() => setShowLevelUp(null)} className="px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase tracking-wider">{t('levelUp.continue')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
