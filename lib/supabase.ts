import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

// Get user profile
export async function getUserProfile(userId: string) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Profile fetch failed:', error);
    return null;
  }
}

// Award coins for video completion
export async function awardCoinsForVideo(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  if (!userId || !videoId || watchDuration < 0) {
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    const { data, error } = await supabase
      .rpc('award_coins_simple_no_filters', {
        user_uuid: userId,
        video_uuid: videoId,
        watch_duration: watchDuration
      });
      
    if (error) {
      console.error('Error awarding coins:', error);
      return { success: false, error: error.message };
    }
    
    return data;
  } catch (error) {
    console.error('awardCoinsForVideo error:', error);
    return { success: false, error: error.message };
  }
}

// Get video queue
export async function getVideoQueue(userId: string) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase.rpc('get_next_video_queue_simple', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error fetching video queue:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('getVideoQueue error:', error);
    return null;
  }
}

// Create video promotion with hold period
export async function createVideoWithHold(
  coinCost: number,
  coinReward: number,
  durationSeconds: number,
  targetViews: number,
  title: string,
  userId: string,
  youtubeUrl: string
) {
  try {
    const { data, error } = await supabase.rpc('create_video_simple', {
      coin_cost_param: coinCost,
      coin_reward_param: coinReward,
      duration_seconds_param: durationSeconds,
      target_views_param: targetViews,
      title_param: title,
      user_uuid: userId,
      youtube_url_param: youtubeUrl
    });

    if (error) {
      console.error('Error creating video:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('createVideoWithHold error:', error);
    return null;
  }
}