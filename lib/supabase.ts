import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  console.error('Required variables: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY');
  
  // Provide fallback values for development to prevent app crash
  const fallbackUrl = 'https://placeholder.supabase.co';
  const fallbackKey = 'placeholder-anon-key';
  
  console.warn('Using fallback values. App functionality will be limited.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key', 
  {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
    // Disable all email confirmation requirements
    confirmSignUp: false,
    emailRedirectTo: undefined,
  },
  global: {
    headers: {
      'X-Client-Info': 'vidgro-app',
    },
  },
});

// Helper function to get user profile
export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Profile fetch failed:', error);
    return null;
  }
}

// Helper function to update user coins
export async function updateUserCoins(
  userId: string,
  amount: number,
  transactionType: string,
  description: string,
  referenceId?: string
) {
  const { data, error } = await supabase.rpc('update_user_coins', {
    user_uuid: userId,
    coin_amount: amount,
    transaction_type_param: transactionType,
    description_param: description,
    reference_uuid: referenceId || null
  });

  if (error) {
    console.error('Error updating user coins:', error);
    return false;
  }

  return data;
}

// Helper function to get next video for user
export async function getNextVideoForUser(userId: string) {
  const { data, error } = await supabase.rpc('get_next_video_for_user_enhanced', {
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching next video:', error);
    return null;
  }

  return data;
}

// Helper function to award coins for video completion
export async function awardCoinsForVideoCompletion(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  const { data, error } = await supabase.rpc('award_coins_for_video_completion', {
    user_uuid: userId,
    video_uuid: videoId,
    watch_duration: watchDuration
  });

  if (error) {
    console.error('Error awarding coins:', error);
    return null;
  }

  return data;
}

// Helper function to create video with hold
export async function createVideoWithHold(
  userId: string,
  youtubeUrl: string,
  title: string,
  description: string,
  duration: number,
  coinCost: number,
  coinReward: number,
  targetViews: number
) {
  const { data, error } = await supabase.rpc('create_video_with_hold', {
    user_uuid: userId,
    youtube_url_param: youtubeUrl,
    title_param: title,
    description_param: description,
    duration_seconds_param: duration,
    coin_cost_param: coinCost,
    coin_reward_param: coinReward,
    target_views_param: targetViews
  });

  if (error) {
    console.error('Error creating video:', error);
    return null;
  }

  return data;
}

// Helper function to get video analytics
export async function getVideoAnalytics(videoId: string, userId: string) {
  const { data, error } = await supabase.rpc('get_video_analytics_realtime_v2', {
    video_uuid: videoId,
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching video analytics:', error);
    return null;
  }

  return data;
}