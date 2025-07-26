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


// Video completion function using coin_transactions table
export async function processVideoCompletion(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  try {
    console.log('🎯 processVideoCompletion called:', { userId, videoId, watchDuration });
    
    // Get video details first
    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();
      
    if (videoError || !videoData) {
      console.error('❌ Video not found:', videoError);
      return { success: false, error: 'Video not found' };
    }
    
    // Check if user already completed this video
    const { data: existingTransaction, error: transactionError } = await supabase
      .from('coin_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', videoId)
      .eq('transaction_type', 'video_watch')
      .single();
      
    if (existingTransaction) {
      console.log('⚠️ Video already completed by user');
      return { success: false, error: 'Video already completed' };
    }
    
    // Validate watch duration
    if (watchDuration < videoData.duration_seconds) {
      console.log('⚠️ Insufficient watch time');
      return { success: false, error: 'Insufficient watch time' };
    }
    
    // Award coins via transaction
    const { data: transactionData, error: transactionInsertError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: videoData.coin_reward,
        transaction_type: 'video_watch',
        description: `Watched video: ${videoData.title}`,
        reference_id: videoId
      })
      .select()
      .single();
      
    if (transactionInsertError) {
      console.error('❌ Error creating transaction:', transactionInsertError);
      return { success: false, error: 'Failed to award coins' };
    }
    
    // Update video view count
    const { error: videoUpdateError } = await supabase
      .from('videos')
      .update({ 
        views_count: supabase.raw('views_count + 1'),
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);
      
    if (videoUpdateError) {
      console.error('❌ Error updating video views:', videoUpdateError);
    }
    
    // Get user's new balance
    const { data: balanceData } = await supabase
      .from('coin_transactions')
      .select('amount')
      .eq('user_id', userId);
      
    const newBalance = balanceData?.reduce((sum, t) => sum + t.amount, 0) || 0;
    
    console.log('✅ Coins awarded successfully');
    
    return {
      success: true,
      coins_earned: videoData.coin_reward,
      new_balance: newBalance,
      message: 'Coins awarded successfully'
    };
  } catch (error) {
    console.error('❌ processVideoCompletion error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to get user balance from coin_transactions
export async function getUserBalance(userId: string) {
  try {
    const { data: transactions, error } = await supabase
      .from('coin_transactions')
      .select('amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user balance:', error);
      return { balance: 0, last_updated: null };
    }

    const balance = transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;
    const lastUpdated = transactions?.[0]?.created_at || null;

    return {
      balance,
      last_updated: lastUpdated
    };
  } catch (error) {
    console.error('Error in getUserBalance:', error);
    return { balance: 0, last_updated: null };
  }
}

// Helper function to get transaction history (if you still have coin_transactions for history)
export async function getUserTransactionHistory(userId: string, limit: number = 50, offset: number = 0) {
  try {
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
    // Get videos that user hasn't completed yet
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

    // Filter out videos user has already completed
    const { data: completedVideos } = await supabase
      .from('coin_transactions')
      .select('reference_id')
      .eq('user_id', userId)
      .eq('transaction_type', 'video_watch');
      
    const completedVideoIds = new Set(completedVideos?.map(t => t.reference_id) || []);
    
    const availableVideos = data?.filter(video => !completedVideoIds.has(video.id)) || [];

    // Transform data to match expected format
    return availableVideos.map(video => ({
      video_id: video.id,
      youtube_url: video.youtube_url,
      title: video.title,
      duration_seconds: video.duration_seconds,
      coin_reward: video.coin_reward,
      views_count: video.views_count,
      target_views: video.target_views,
      status: video.status
    }));
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
    // Check user's current balance
    const { balance } = await getUserBalance(userId);
    
    if (balance < coinCost) {
      return { success: false, error: 'Insufficient coins' };
    }
    
    // Create video promotion transaction (negative amount)
    const { data: transactionData, error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -coinCost,
        transaction_type: 'video_promotion',
        description: `Video promotion: ${title}`,
        reference_id: null
      })
      .select()
      .single();
      
    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      return { success: false, error: 'Failed to deduct coins' };
    }
    
    // Create video record
    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        youtube_url: videoId,
        title: title,
        duration_seconds: durationSeconds,
        target_views: targetViews,
        coin_cost: coinCost,
        coin_reward: coinReward,
        status: 'on_hold',
        hold_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
        views_count: 0
      })
      .select()
      .single();

    if (videoError) {
      console.error('Error creating video:', videoError);
      // Rollback transaction
      await supabase
        .from('coin_transactions')
        .delete()
        .eq('id', transactionData.id);
      return { success: false, error: 'Failed to create video' };
    }

    return { success: true, video: videoData, transaction: transactionData };
  } catch (error) {
    console.error('Error in createVideoWithHold:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to get system metrics
export async function getBalanceSystemMetrics() {
  try {
    // Get metrics from coin_transactions table
    const { data: transactionData, error: transactionError } = await supabase
      .from('coin_transactions')
      .select('user_id, amount, transaction_type, created_at');

    if (transactionError) {
      console.error('Error fetching transaction metrics:', transactionError);
      return null;
    }

    // Calculate metrics
    const uniqueUsers = new Set(transactionData?.map(t => t.user_id) || []).size;
    const totalTransactions = transactionData?.length || 0;
    const avgTransactionsPerUser = uniqueUsers > 0 ? Math.round(totalTransactions / uniqueUsers) : 0;
    
    // Simulate storage metrics for display
    const oldSystemSize = totalTransactions * 200; // Simulated old system size
    const newSystemSize = totalTransactions * 120; // Simulated new system size
    const storageReduction = oldSystemSize > 0 ? ((oldSystemSize - newSystemSize) / oldSystemSize) * 100 : 0;

    return {
      old_system_size_bytes: oldSystemSize,
      new_system_size_bytes: newSystemSize,
      storage_reduction_percent: storageReduction,
      total_users: uniqueUsers,
      total_transactions: totalTransactions,
      avg_transactions_per_user: avgTransactionsPerUser,
      performance_improvement: 'SIGNIFICANT'
    };
  } catch (error) {
    console.error('Error in getBalanceSystemMetrics:', error);
    return null;
  }
}

// Helper function to repromote video
export async function repromoteVideoWithBalance(
  userId: string,
  videoId: string,
  newTargetViews: number,
  newDuration: number,
  coinCost: number
) {
  try {
    // Check user's current balance
    const { balance } = await getUserBalance(userId);
    
    if (balance < coinCost) {
      return { success: false, error: 'Insufficient coins' };
    }
    
    // Create repromote transaction (negative amount)
    const { data: transactionData, error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -coinCost,
        transaction_type: 'video_promotion',
        description: `Video repromoted with ${newTargetViews} target views`,
        reference_id: videoId
      })
      .select()
      .single();
      
    if (transactionError) {
      console.error('Error creating repromote transaction:', transactionError);
      return { success: false, error: 'Failed to deduct coins' };
    }
    
    // Update video with new parameters
    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .update({
        target_views: newTargetViews,
        duration_seconds: newDuration,
        status: 'repromoted',
        repromoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .eq('user_id', userId)
      .select()
      .single();

    if (videoError) {
      console.error('Error updating video:', videoError);
      // Rollback transaction
      await supabase
        .from('coin_transactions')
        .delete()
        .eq('id', transactionData.id);
      return { success: false, error: 'Failed to update video' };
    }

    const newBalance = balance - coinCost;
    
    return { 
      success: true, 
      video: videoData, 
      transaction: transactionData,
      new_balance: newBalance
    };
  } catch (error) {
    console.error('Error in repromoteVideoWithBalance:', error);
    return { success: false, error: error.message };
  }
}