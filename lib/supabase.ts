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
    // Completely disable email confirmation
    confirmSignUp: false,
    emailRedirectTo: undefined,
    skipConfirmationForLocalhost: true,
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
    console.log('Fetching profile for user ID:', userId);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error.message, error.details);
      
      // If profile doesn't exist, wait a moment and try again
      if (error.code === 'PGRST116') {
        console.log('Profile not found, waiting for trigger to create it...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const { data: retryData, error: retryError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (retryError) {
          console.error('Profile still not found after retry:', retryError.message);
          return null;
        }
        
        console.log('Profile found on retry');
        return retryData;
      }
      
      return null;
    }

    console.log('Profile fetched successfully');
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
  const { data, error } = await supabase.rpc('update_user_coins_improved', {
    user_uuid: userId,
    coin_amount: amount,
    transaction_type_param: transactionType,
    description_param: description,
    reference_uuid: referenceId || null
  });

  if (error) {
    console.error('Error updating user coins:', error);
    return { success: false, error: error.message };
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
  console.log('🎯 Calling award_coins_for_video_completion with:', {
    userId,
    videoId,
    watchDuration
  });
  
  const { data, error } = await supabase.rpc('award_coins_for_video_completion', {
    user_uuid: userId,
    video_uuid: videoId,
    watch_duration: watchDuration
  });

  if (error) {
    console.error('Error awarding coins:', error);
    // Return a failed result instead of null to help with debugging
    return { success: false, error: error.message };
  }

  console.log('💰 Coin award response:', data);
  return data;
}

// Helper function to create video with hold
export async function createVideoWithHold(
  coinCost: number,
  coinReward: number,
  durationSeconds: number,
 targetViews: number,
  title: string,
  userId: string,
  videoId: string
) {
  console.log('Creating video with parameters:', {
    coinCost,
    coinReward,
    durationSeconds,
   targetViews,
    title,
    userId,
    videoId
  });

  const { data, error } = await supabase.rpc('create_video_with_hold', {
    coin_cost_param: coinCost,
    coin_reward_param: coinReward,
    duration_seconds_param: durationSeconds,
    target_views_param: targetViews,
    title_param: title,
    user_uuid: userId,
    youtube_url_param: videoId
  });

  if (error) {
    console.error('Error creating video:', error);
    return null;
  }

  return data;
}

// Helper function to get clean video analytics (without coin rewards)
export async function getVideoAnalytics(videoId: string, userId: string) {
  const { data, error } = await supabase.rpc('get_video_analytics_clean', {
    video_uuid: videoId,
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching video analytics:', error);
    return null;
  }

  return data;
}

// Helper function to get recent activity
export async function getRecentActivity(userId: string, limit: number = 10) {
  const { data, error } = await supabase.rpc('get_recent_activity', {
    user_uuid: userId,
    activity_limit: limit
  });

  if (error) {
    console.error('Error fetching recent activity:', error);
    return null;
  }

  return data;
}

// Helper function to process video queue maintenance
export async function processVideoQueueMaintenance() {
  // Use the new automatic status checking function
  const { data, error } = await supabase.rpc('check_and_update_expired_holds');

  if (error) {
    console.error('Error checking expired holds:', error);
    return false;
  }

  if (data && data > 0) {
    console.log(`${data} videos automatically activated from hold status`);
  }

  return true;
}

// Helper function to get video with automatic status checking
export async function getVideoWithStatusCheck(videoId: string, userId: string) {
  const { data, error } = await supabase.rpc('get_video_with_status_check', {
    video_uuid: videoId,
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching video with status check:', error);
    return null;
  }

  return data;
}

// Helper function to check and update expired holds
export async function checkAndUpdateExpiredHolds() {
  const { data, error } = await supabase.rpc('check_and_update_expired_holds');

  if (error) {
    console.error('Error checking expired holds:', error);
    return 0;
  }

  return data || 0;
}