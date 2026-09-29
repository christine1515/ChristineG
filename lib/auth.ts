import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  // 1. Pass profile metadata inside options.data so it is immediately attached to the User object
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      data: profile ? {
        full_name: profile.full_name,
        role: profile.role,
      } : undefined,
    },
  });

  // 2. Safely grab the user ID whether email confirmation is turned ON or OFF
  const userId = data?.user?.id || data?.session?.user?.id;

  if (!error && userId && profile) {
    // 3. Use 'upsert' instead of 'update' so a brand new profile row is forced into the table
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ 
        id: userId, 
        full_name: profile.full_name, 
        role: profile.role 
      });

    if (profileError) {
      console.error('Error writing to public.profiles:', profileError.message);
    }
  }

  if (!error && data.session) {
    setAuth(data.session);
  }

  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}
