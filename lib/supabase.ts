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


// SIMPLIFIED: Single video completion function that updates user_balances directly
export async function processVideoCompletion(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  try {
    console.log('🎯 processVideoCompletion called:', { userId, videoId, watchDuration });
    
    // Use the simplified atomic balance update function only
    const { data, error } = await supabase
      .rpc('update_user_balance_atomic', {
        user_uuid: userId,
        coin_amount: 3, // Fixed reward amount
        transaction_type_param: 'video_watch',
        description_param: `Completed video: ${videoId}`,
        reference_uuid: videoId
      });
      
    if (error) {
      console.error('❌ Error in processVideoCompletion:', error);
      throw error;
    }
    
    console.log('🎯 Coin update result:', data);
    
    if (data.success) {
      console.log('✅ Coins awarded successfully');
      return data;
    } else {
      console.error('❌ Balance update failed:', data.error);
      return data;
    }
  } catch (error) {
    console.error('❌ processVideoCompletion error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to get user balance quickly
export async function getUserBalanceFast(userId: string) {
  const { data, error } = await supabase.rpc('get_user_balance_fast', {
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching user balance:', error);
    return null;
  }

  return data;
}

// Helper function to get transaction history from audit log
export async function getUserTransactionHistory(userId: string, limit: number = 50, offset: number = 0) {
  const { data, error } = await supabase.rpc('get_user_transaction_history', {
    user_uuid: userId,
    limit_count: limit,
    offset_count: offset
  });

  if (error) {
    console.error('Error fetching transaction history:', error);
    return null;
  }

  return data;
}

// Helper function to get next video for user
export async function getNextVideoQueueEnhanced(userId: string) {
  const { data, error } = await supabase.rpc('get_next_video_queue_enhanced', {
    user_uuid: userId
  });

  if (error) {
    console.error('Error fetching next video:', error);
    return null;
  }

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

  const { data, error } = await supabase.rpc('create_video_optimized', {
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

// Helper function to get balance system performance metrics
export async function getBalanceSystemMetrics() {
  const { data, error } = await supabase.rpc('get_balance_system_metrics');

  if (error) {
    console.error('Error fetching balance system metrics:', error);
    return null;
  }

  return data;
}
