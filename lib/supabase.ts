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
  watchDuration: number,
  engagementDuration?: number
) {
  if (!userId || !videoId || watchDuration < 0) {
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    // Use enhanced award function with engagement tracking
    const { data, error } = await supabase
      .rpc('award_coins_with_engagement_tracking', {
        user_uuid: userId,
        video_uuid: videoId,
        watch_duration: watchDuration,
        engagement_duration: engagementDuration || watchDuration
      });
      
    if (error) {
      console.error('Error awarding coins with engagement:', error);
      // Fallback to simple version
      return await awardCoinsSimple(userId, videoId, watchDuration);
    }
    
    return data;
  } catch (error) {
    console.error('awardCoinsForVideo error:', error);
    // Fallback to simple version
    return await awardCoinsSimple(userId, videoId, watchDuration);
  }
}

// Fallback function for simple coin awarding
async function awardCoinsSimple(userId: string, videoId: string, watchDuration: number) {
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
    console.error('awardCoinsSimple error:', error);
    return { success: false, error: error.message };
  }
}

// Get video queue
export async function getVideoQueue(userId: string) {
  if (!userId) return null;

  try {
    // Use enhanced queue function that excludes user's own videos
    const { data, error } = await supabase.rpc('get_next_video_queue_enhanced', {
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

// Get video engagement analytics
export async function getVideoEngagementAnalytics(videoId: string) {
  if (!videoId) return null;

  try {
    const { data, error } = await supabase.rpc('get_video_engagement_analytics', {
      video_uuid: videoId
    });

    if (error) {
      console.error('Error fetching video engagement analytics:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('getVideoEngagementAnalytics error:', error);
    return null;
  }
}

// Cleanup expired transactions (can be called periodically)
export async function cleanupExpiredTransactions() {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_transactions');

    if (error) {
      console.error('Error cleaning up expired transactions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, deletedCount: data };
  } catch (error) {
    console.error('cleanupExpiredTransactions error:', error);
    return { success: false, error: error.message };
  }
}

// Check if video should be removed from promotion queue
export async function checkPromotionQueueEligibility(videoId: string) {
  if (!videoId) return false;

  try {
    const { data, error } = await supabase.rpc('check_promotion_queue_eligibility', {
      video_uuid: videoId
    });

    if (error) {
      console.error('Error checking promotion queue eligibility:', error);
      return false;
    }

    return data;
  } catch (error) {
    console.error('checkPromotionQueueEligibility error:', error);
    return false;
  }
}