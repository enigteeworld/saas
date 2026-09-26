import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { NotificationRow } from '@/lib/notifications';

/** Loads the signed-in user's notifications and keeps them live via Realtime. */
export function useNotifications(userId: string | undefined, limit = 100) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id, type, title, message, data, is_read, created_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (queryError) {
      console.error('Unable to load notifications:', queryError);
      setError(queryError.message);
    } else {
      setError('');
      setItems((data ?? []) as NotificationRow[]);
    }
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    void load();
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `profile_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();

    // Fallback for projects where Realtime is not enabled.
    const timer = window.setInterval(() => void load(), 60000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markRead = useCallback(
    async (id: string) => {
      setItems((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (updateError) console.error(updateError);
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', userId)
      .eq('is_read', false);
    if (updateError) console.error(updateError);
  }, [userId]);

  return {
    items,
    loading,
    error,
    unread: items.filter((item) => !item.is_read).length,
    reload: load,
    markRead,
    markAllRead,
  };
}

export default useNotifications;
