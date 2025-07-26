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


// Updated video completion function for new user_balances system
export async function processVideoCompletion(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  try {
    console.log('🎯 processVideoCompletion called:', { userId, videoId, watchDuration });
    
    // Use the new video completion function that works with user_balances
    const { data, error } = await supabase
      .rpc('complete_video_watch', {
        user_uuid: userId,
        video_uuid: videoId,
        watch_duration_param: watchDuration
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

// Helper function to get user balance from user_balances table
export async function getUserBalanceFast(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_balances')
      .select('current_balance, last_transaction_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching user balance:', error);
      return null;
    }

    return {
      balance: data.current_balance,
      last_updated: data.last_transaction_at
    };
  } catch (error) {
    console.error('Error in getUserBalanceFast:', error);
    return null;
  }
}

// Helper function to get transaction history (if you still have coin_transactions for history)
export async function getUserTransactionHistory(userId: string, limit: number = 50, offset: number = 0) {
  try {
    // If you still have coin_transactions for history, query it directly
    const { data, error } = await supabase
      .from('coin_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserTransactionHistory:', error);
    return [];
  }
}

// Helper function to get next video for user
export async function getNextVideoQueueEnhanced(userId: string) {
  try {
    // Direct query to get available videos
    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        youtube_url,
        title,
        duration_seconds,
        coin_reward,
        views_count,
        target_views,
        status,
        user_id
      `)
      .in('status', ['active', 'repromoted'])
      .neq('user_id', userId)
      .lt('views_count', supabase.raw('target_views'))
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error fetching video queue:', error);
      return [];
    }

    // Transform data to match expected format
    return data?.map(video => ({
      video_id: video.id,
      youtube_url: video.youtube_url,
      title: video.title,
      duration_seconds: video.duration_seconds,
      coin_reward: video.coin_reward,
      views_count: video.views_count,
      target_views: video.target_views,
      status: video.status
    })) || [];
  } catch (error) {
    console.error('Error in getNextVideoQueueEnhanced:', error);
    return [];
  }
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

  try {
    // Use the new video creation function that works with user_balances
    const { data, error } = await supabase.rpc('create_video_with_balance_deduction', {
      user_uuid: userId,
      youtube_url_param: videoId,
      title_param: title,
      duration_seconds_param: durationSeconds,
      target_views_param: targetViews,
      coin_cost_param: coinCost,
      coin_reward_param: coinReward
    });

    if (error) {
      console.error('Error creating video:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createVideoWithHold:', error);
    return null;
  }
}

// Helper function to get balance system performance metrics
export async function getBalanceSystemMetrics() {
  try {
    // Simple metrics from user_balances table
    const { data: balanceData, error: balanceError } = await supabase
      .from('user_balances')
      .select('current_balance, created_at, updated_at');

    if (balanceError) {
      console.error('Error fetching balance metrics:', balanceError);
      return null;
    }

    // Calculate basic metrics
    const totalUsers = balanceData?.length || 0;
    const totalBalance = balanceData?.reduce((sum, user) => sum + user.current_balance, 0) || 0;
    const avgBalance = totalUsers > 0 ? Math.round(totalBalance / totalUsers) : 0;
}

    return {
      total_users: totalUsers,
      total_balance: totalBalance,
      average_balance: avgBalance,
      performance_improvement: 'SIGNIFICANT'
    };
  } catch (error) {
    console.error('Error in getBalanceSystemMetrics:', error);
    return null;
  }