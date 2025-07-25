import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getUserProfile } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  username: string;
  coins: number;
  is_vip: boolean;
  vip_expires_at: string | null;
  referral_code: string;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      console.log('Loading profile for user:', userId);
      
      // Get profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profileError) {
        console.error('Error loading profile:', profileError);
        return;
      }
      
      // Get current balance from coin_transactions table
      const { data: transactionData, error: transactionError } = await supabase
        .from('coin_transactions')
        .select('amount')
        .eq('user_id', userId);
        
      const currentBalance = transactionData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        
      if (profileData) {
        console.log('Profile loaded successfully:', profileData.username);
        
        // Merge profile with calculated balance
        setProfile({
          ...profileData,
          coins: currentBalance
        });
      } else {
        console.warn('No profile data returned for user:', userId);
        // Wait a moment and try again in case profile is still being created
        setTimeout(async () => {
          console.log('Retrying profile load...');
          
          const { data: retryProfileData, error: retryProfileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
          const { data: retryTransactionData } = await supabase
            .from('coin_transactions')
            .select('amount')
            .eq('user_id', userId);
            
          const retryBalance = retryTransactionData?.reduce((sum, t) => sum + t.amount, 0) || 0;
            
          if (retryProfileData) {
            console.log('Profile loaded on retry:', retryProfileData.username);
            setProfile({
              ...retryProfileData,
              coins: retryBalance
            });
          } else {
            console.error('Profile still not found after retry');
            // Create a minimal profile object to prevent app crashes
            setProfile({
              id: userId,
              email: user?.email || 'unknown@example.com',
              username: 'User',
              coins: 0,
              is_vip: false,
              vip_expires_at: null,
              referral_code: 'LOADING',
              referred_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      // Wait and retry on error too
      setTimeout(async () => {
        try {
          const { data: retryProfileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
          const { data: retryTransactionData } = await supabase
            .from('coin_transactions')
            .select('amount')
            .eq('user_id', userId);
            
          const retryBalance = retryTransactionData?.reduce((sum, t) => sum + t.amount, 0) || 0;
            
          if (retryProfileData) {
            setProfile({
              ...retryProfileData,
              coins: retryBalance
            });
          } else {
            // Set a fallback profile to prevent crashes
            setProfile({
              id: userId,
              email: user?.email || 'unknown@example.com',
              username: 'User',
              coins: 0,
              is_vip: false,
              vip_expires_at: null,
              referral_code: 'ERROR',
              referred_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        }
      }, 2000);
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('Attempting login with email:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.log('Login error:', error.message);
    } else {
      console.log('Login successful for user:', data?.user?.id);
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, username: string) => {
    console.log('Attempting signup with:', { email, username });
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined,
        data: {
          username,
        },
      },
    });
    
    console.log('Signup result:', { 
      user: data?.user?.id, 
      session: data?.session?.access_token ? 'present' : 'null',
      error: error?.message 
    });
    
    // If signup successful but no session, try to sign in immediately
    if (data?.user && !data?.session && !error) {
      console.log('User created but no session, attempting immediate sign in...');
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (signInError) {
        console.log('Auto sign-in failed:', signInError.message);
        return { error: signInError };
      }
      
      console.log('Auto sign-in successful');
      return { error: null };
    }
    
    return { error };
  };

  const signOut = async () => {
    console.log('AuthContext: signOut called');
    
    // Clear local state first to ensure immediate UI update
    setProfile(null);
    setUser(null);
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('AuthContext: Supabase signOut error:', error);
      } else {
        console.log('AuthContext: Supabase signOut successful');
      }
    } catch (error) {
      console.error('AuthContext: signOut exception:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}