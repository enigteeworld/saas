import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Notifications and emails are created by database triggers (see
 * supabase/workflow-patch.sql). Emails are queued in `email_outbox`; this asks
 * the `send-notification-emails` edge function to deliver whatever is queued.
 * Call it (fire-and-forget) right after any action that notifies someone.
 */
export function flushEmailOutbox() {
  if (!isSupabaseConfigured) return;
  void supabase.functions
    .invoke('send-notification-emails', { body: {} })
    .then(({ error }) => {
      if (error) console.warn('Email delivery not triggered:', error.message);
    })
    .catch((error) => console.warn('Email delivery not triggered:', error));
}

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  data: { link?: string | null } | null;
  is_read: boolean;
  created_at: string;
};
