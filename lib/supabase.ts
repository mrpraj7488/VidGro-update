import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  console.error('Required variables: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY');
  throw new Error('Supabase configuration missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  global: {
    headers: {
      'X-Client-Info': 'vidgro-app',
    },
  },
});

// OPTIMIZED: Single function to get user profile with better error handling
export async function getUserProfile(userId: string) {
  // Add timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Profile fetch timeout')), 10000); // 10 second timeout
  });
  
  if (!userId) {
    console.error('getUserProfile: No userId provided');
    return null;
  }

  try {
    console.log('Fetching profile for user ID:', userId);
    
    const { data, error } = await Promise.race([supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single(), timeoutPromise]);

    if (error) {
      console.error('Error fetching user profile:', error.message);
      
      // Handle profile not found - wait for trigger to create it
      if (error.code === 'PGRST116') {
        console.log('Profile not found, waiting for trigger to create it...');
        
        // Wait and retry once
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduce wait time
        
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

    // Validate profile data
    if (!data || !data.id || !data.email) {
      console.error('Invalid profile data received:', data);
      return null;
    }

    console.log('Profile fetched successfully');
    return data;
  } catch (error) {
    console.error('Profile fetch failed:', error);
    
    if (error.message === 'Profile fetch timeout') {
      console.error('Profile fetch timed out after 10 seconds');
    }
    return null;
  }
}

// OPTIMIZED: Direct database function call - no wrapper needed
export async function awardCoinsForVideo(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  if (!userId || !videoId || watchDuration < 0) {
    console.error('awardCoinsForVideo: Invalid parameters');
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    console.log('🎯 Awarding coins for video:', { userId, videoId, watchDuration });
    
    const { data, error } = await supabase
      .rpc('award_coins_simple_no_filters', {
        user_uuid: userId,
        video_uuid: videoId,
        watch_duration: watchDuration
      });
      
    if (error) {
      console.error('❌ Error awarding coins:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Coins awarded successfully:', data);
    return data;
    
  } catch (error) {
    console.error('❌ awardCoinsForVideo error:', error);
    return { success: false, error: error.message };
  }
}

// OPTIMIZED: Simple video queue fetching
export async function getVideoQueue(userId: string) {
  if (!userId) {
    console.error('getVideoQueue: No userId provided');
    return null;
  }

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

// OPTIMIZED: Create video with proper validation
export async function createVideo(
  userId: string,
  videoId: string,
  title: string,
  coinCost: number,
  coinReward: number,
  durationSeconds: number,
  targetViews: number
) {
  if (!userId || !videoId || !title || coinCost < 0 || coinReward < 0 || durationSeconds < 0) {
    console.error('createVideo: Invalid parameters');
    return null;
  }

  try {
    console.log('Creating video:', {
      userId,
      videoId,
      title,
      coinCost,
      coinReward,
      durationSeconds,
      targetViews
    });

    const { data, error } = await supabase.rpc('create_video_simple', {
      user_uuid: userId,
      youtube_url_param: videoId,
      title_param: title,
      coin_cost_param: coinCost,
      coin_reward_param: coinReward,
      duration_seconds_param: durationSeconds,
      target_views_param: targetViews
    });

    if (error) {
      console.error('Error creating video:', error);
      return null;
    }

    console.log('Video created successfully:', data);
    return data;
  } catch (error) {
    console.error('createVideo error:', error);
    return null;
  }
}

// UTILITY: Update user coins for other transactions (not video rewards)
export async function updateUserCoins(
  userId: string,
  coinAmount: number,
  transactionType: string,
  description: string,
  referenceId?: string
) {
  if (!userId || coinAmount === 0 || !transactionType || !description) {
    console.error('updateUserCoins: Invalid parameters');
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    console.log('🪙 Updating user coins:', { userId, coinAmount, transactionType });
    
    const { data, error } = await supabase
      .rpc('update_user_coins_simple', {
        user_uuid: userId,
        coin_amount: coinAmount,
        transaction_type_param: transactionType,
        description_param: description,
        reference_uuid: referenceId
      });
      
    if (error) {
      console.error('❌ Error updating user coins:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Coins updated successfully:', data);
    return data;
  } catch (error) {
    console.error('❌ updateUserCoins error:', error);
    return { success: false, error: error.message };
  }
}

// DATABASE HEALTH CHECK
export async function checkDatabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count(*)')
      .limit(1);

    if (error) {
      console.error('Database connection failed:', error);
      return false;
    }

    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}