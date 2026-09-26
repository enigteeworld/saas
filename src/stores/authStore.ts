import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';

const DEMO_KEY = 'enigtee-world-demo-user';

function readDemoUser(): Profile | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function writeDemoUser(user: Profile | null) {
  try {
    if (user) localStorage.setItem(DEMO_KEY, JSON.stringify(user));
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* storage unavailable */
  }
}

interface AuthState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initializeAuth: () => Promise<void>;
  demoSignIn: (role: UserRole, fullName?: string) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initializeAuth: async () => {
    if (!isSupabaseConfigured) {
      const demo = readDemoUser();
      set({ user: demo, isAuthenticated: !!demo, isLoading: false });
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      writeDemoUser(null);
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

  demoSignIn: (role, fullName) => {
    const user: Profile = {
      id: `demo-${role}`,
      email: `${role}@enigteeworld.demo`,
      full_name: fullName || (role === 'admin' ? 'HR Administrator' : role === 'employer' ? 'Employer Account' : 'Employee Account'),
      role,
      is_active: true,
    };
    writeDemoUser(user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  signOut: async () => {
    writeDemoUser(null);
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
