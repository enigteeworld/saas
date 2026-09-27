import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initializeAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initializeAuth: async () => {
    if (!isSupabaseConfigured) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.session.user.id)
      .maybeSingle();

    set({
      user: (profile as Profile | null) ?? null,
      isAuthenticated: !!profile,
      isLoading: false,
    });
  },


  signOut: async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

export function initializeAuthListener() {
  if (!isSupabaseConfigured) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => {
    void useAuthStore.getState().initializeAuth();
  });
  return () => data.subscription.unsubscribe();
}
