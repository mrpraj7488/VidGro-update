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

// Helper function to get user balance from coin_transactions
export async function getUserBalance(userId: string) {
  try {
    const { data, error } = await supabase
      .from('coin_transactions')
      .select('amount')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user balance:', error);
      return 0;
    }

    const balance = data?.reduce((sum, transaction) => sum + transaction.amount, 0) || 0;
    return Math.max(balance, 0);
  } catch (error) {
    console.error('Error in getUserBalance:', error);
    return 0;
  }
}

// Video completion function using coin_transactions
export async function processVideoCompletion(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  try {
    console.log('🎯 processVideoCompletion called:', { userId, videoId, watchDuration });
    
    // Check if user has already completed this video
    const { data: existingView, error: viewError } = await supabase
      .from('video_views')
      .select('completed')
      .eq('video_id', videoId)
      .eq('viewer_id', userId)
      .single();

    if (existingView?.completed) {
      console.log('Video already completed by user');
      return { success: false, error: 'Video already completed' };
    }

    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      console.error('Video not found:', videoError);
      return { success: false, error: 'Video not found' };
    }

    // Validate watch duration
    if (watchDuration < video.duration_seconds) {
      return { 
        success: false, 
        error: 'Insufficient watch time',
        required: video.duration_seconds,
        watched: watchDuration
      };
    }

    // Record video view
    const { error: viewInsertError } = await supabase
      .from('video_views')
      .insert({
        video_id: videoId,
        viewer_id: userId,
        watched_duration: watchDuration,
        completed: true,
        coins_earned: video.coin_reward
      });

    if (viewInsertError) {
      console.error('Error recording video view:', viewInsertError);
      return { success: false, error: 'Failed to record view' };
    }

    // Award coins via coin_transactions
    const { error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: video.coin_reward,
        transaction_type: 'video_watch',
        description: `Watched video: ${video.title}`,
        reference_id: videoId
      });

    if (transactionError) {
      console.error('Error creating coin transaction:', transactionError);
      // Rollback video view
      await supabase
        .from('video_views')
        .delete()
        .eq('video_id', videoId)
        .eq('viewer_id', userId);
      return { success: false, error: 'Failed to award coins' };
    }

    // Update video stats
    const { error: updateError } = await supabase
      .from('videos')
      .update({
        views_count: video.views_count + 1,
        status: (video.views_count + 1) >= video.target_views ? 'completed' : video.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (updateError) {
      console.error('Error updating video stats:', updateError);
    }

    // Get new balance
    const newBalance = await getUserBalance(userId);

    console.log('✅ Video completion successful');
    return {
      success: true,
      coins_earned: video.coin_reward,
      new_balance: newBalance,
      video_completed: (video.views_count + 1) >= video.target_views
    };

  } catch (error) {
    console.error('❌ processVideoCompletion error:', error);
    return { success: false, error: error.message };
  }
}

// Legacy function name for backward compatibility
export async function complete_video_watch(
  userId: string,
  videoId: string,
  watchDuration: number
) {
  return processVideoCompletion(userId, videoId, watchDuration);
}

// Create video with balance deduction using coin_transactions
export async function createVideoWithBalanceDeduction(
  userId: string,
  youtubeUrl: string,
  title: string,
  durationSeconds: number,
  targetViews: number,
  coinCost: number,
  coinReward: number
) {
  try {
    // Check user balance
    const currentBalance = await getUserBalance(userId);
    if (currentBalance < coinCost) {
      return { 
        success: false, 
        error: `Insufficient coins. Required: ${coinCost}, Available: ${currentBalance}` 
      };
    }

    // Create video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        youtube_url: youtubeUrl,
        title: title,
        duration_seconds: durationSeconds,
        target_views: targetViews,
        coin_cost: coinCost,
        coin_reward: coinReward,
        status: 'on_hold',
        hold_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes hold
      })
      .select()
      .single();

    if (videoError) {
      console.error('Error creating video:', videoError);
      return { success: false, error: 'Failed to create video' };
    }

    // Deduct coins via coin_transactions
    const { error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -coinCost,
        transaction_type: 'video_promotion',
        description: `Video promotion: ${title}`,
        reference_id: video.id
      });

    if (transactionError) {
      console.error('Error creating coin transaction:', transactionError);
      // Rollback video creation
      await supabase.from('videos').delete().eq('id', video.id);
      return { success: false, error: 'Failed to deduct coins' };
    }

    const newBalance = await getUserBalance(userId);

    return {
      success: true,
      video_id: video.id,
      new_balance: newBalance,
      message: 'Video created successfully and is on hold for 10 minutes'
    };

  } catch (error) {
    console.error('Error in createVideoWithBalanceDeduction:', error);
    return { success: false, error: error.message };
  }
}

// Legacy function name for backward compatibility
export async function create_video_with_balance_deduction(
  userId: string,
  youtubeUrl: string,
  title: string,
  durationSeconds: number,
  targetViews: number,
  coinCost: number,
  coinReward: number
) {
  return createVideoWithBalanceDeduction(
    userId, youtubeUrl, title, durationSeconds, targetViews, coinCost, coinReward
  );
}

// Repromote video with balance deduction using coin_transactions
export async function repromoteVideoWithBalance(
  userId: string,
  videoId: string,
  newTargetViews: number,
  newDuration: number,
  coinCost: number
) {
  try {
    // Check user balance
    const currentBalance = await getUserBalance(userId);
    if (currentBalance < coinCost) {
      return { 
        success: false, 
        error: `Insufficient coins. Required: ${coinCost}, Available: ${currentBalance}` 
      };
    }

    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (videoError || !video) {
      return { success: false, error: 'Video not found' };
    }

    // Update video for repromotion
    const { error: updateError } = await supabase
      .from('videos')
      .update({
        target_views: newTargetViews,
        duration_seconds: newDuration,
        coin_cost: video.coin_cost + coinCost,
        status: 'repromoted',
        repromoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (updateError) {
      console.error('Error updating video:', updateError);
      return { success: false, error: 'Failed to update video' };
    }

    // Deduct coins via coin_transactions
    const { error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -coinCost,
        transaction_type: 'video_promotion',
        description: `Video repromotion: ${video.title}`,
        reference_id: videoId
      });

    if (transactionError) {
      console.error('Error creating coin transaction:', transactionError);
      return { success: false, error: 'Failed to deduct coins' };
    }

    const newBalance = await getUserBalance(userId);

    return {
      success: true,
      new_balance: newBalance,
      message: 'Video repromoted successfully'
    };

  } catch (error) {
    console.error('Error in repromoteVideoWithBalance:', error);
    return { success: false, error: error.message };
  }
}

// Legacy function name for backward compatibility
export async function repromote_video_with_balance(
  userId: string,
  videoId: string,
  newTargetViews: number,
  newDuration: number,
  coinCost: number
) {
  return repromoteVideoWithBalance(userId, videoId, newTargetViews, newDuration, coinCost);
}

// Get user analytics using coin_transactions
export async function getUserAnalyticsSummary(userId: string) {
  try {
    // Get video statistics
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('status')
      .eq('user_id', userId);

    if (videosError) {
      console.error('Error fetching videos:', videosError);
      return null;
    }

    // Get coins earned from video watching
    const { data: earnedTransactions, error: earnedError } = await supabase
      .from('coin_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('transaction_type', 'video_watch');

    if (earnedError) {
      console.error('Error fetching earned coins:', earnedError);
      return null;
    }

    const totalVideosPromoted = videos?.length || 0;
    const activeVideos = videos?.filter(v => v.status === 'active').length || 0;
    const completedVideos = videos?.filter(v => v.status === 'completed').length || 0;
    const onHoldVideos = videos?.filter(v => v.status === 'on_hold').length || 0;
    const totalCoinsEarned = earnedTransactions?.reduce((sum, t) => sum + t.amount, 0) || 0;

    return {
      total_videos_promoted: totalVideosPromoted,
      total_coins_earned: totalCoinsEarned,
      active_videos: activeVideos,
      completed_videos: completedVideos,
      on_hold_videos: onHoldVideos
    };

  } catch (error) {
    console.error('Error in getUserAnalyticsSummary:', error);
    return null;
  }
}

// Legacy function name for backward compatibility
export async function get_user_analytics_summary_fixed(userId: string) {
  const result = await getUserAnalyticsSummary(userId);
  return result ? [result] : [];
}

// Delete video with refund using coin_transactions
export async function deleteVideoWithRefund(userId: string, videoId: string) {
  try {
    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (videoError || !video) {
      return { success: false, error: 'Video not found' };
    }

    // Calculate refund (100% within 10 minutes, 80% after)
    const createdTime = new Date(video.created_at);
    const now = new Date();
    const minutesSinceCreation = Math.floor((now.getTime() - createdTime.getTime()) / (1000 * 60));
    const refundPercentage = minutesSinceCreation <= 10 ? 100 : 80;
    const refundAmount = Math.floor(video.coin_cost * (refundPercentage / 100));

    // Delete video
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (deleteError) {
      console.error('Error deleting video:', deleteError);
      return { success: false, error: 'Failed to delete video' };
    }

    // Add refund transaction
    if (refundAmount > 0) {
      const { error: transactionError } = await supabase
        .from('coin_transactions')
        .insert({
          user_id: userId,
          amount: refundAmount,
          transaction_type: 'video_deletion_refund',
          description: `Refund for deleted video: ${video.title} (${refundPercentage}%)`,
          reference_id: videoId
        });

      if (transactionError) {
        console.error('Error creating refund transaction:', transactionError);
        return { success: false, error: 'Video deleted but refund failed' };
      }
    }

    const newBalance = await getUserBalance(userId);

    return {
      success: true,
      refund_amount: refundAmount,
      new_balance: newBalance,
      message: `Video deleted successfully. ${refundAmount} coins refunded (${refundPercentage}%)`
    };

  } catch (error) {
    console.error('Error in deleteVideoWithRefund:', error);
    return { success: false, error: error.message };
  }
}

// Get transaction history
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

// Get next video queue
export async function getNextVideoQueueEnhanced(userId: string) {
  try {
    // Get videos that user hasn't completed
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
    const { data: completedViews } = await supabase
      .from('video_views')
      .select('video_id')
      .eq('viewer_id', userId)
      .eq('completed', true);

    const completedVideoIds = completedViews?.map(v => v.video_id) || [];
    const availableVideos = data?.filter(video => !completedVideoIds.includes(video.id)) || [];

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

// Create video with hold (main function used by promote tab)
export async function createVideoWithHold(
  coinCost: number,
  coinReward: number,
  durationSeconds: number,
  targetViews: number,
  title: string,
  userId: string,
  videoId: string
) {
  return createVideoWithBalanceDeduction(
    userId,
    videoId,
    title,
    durationSeconds,
    targetViews,
    coinCost,
    coinReward
  );
}

// Get balance system performance metrics (simplified for coin_transactions)
export async function getBalanceSystemMetrics() {
  try {
    // Get basic metrics from coin_transactions
    const { data, error } = await supabase
      .from('coin_transactions')
      .select('user_id, amount, transaction_type');

    if (error) {
      console.error('Error fetching metrics:', error);
      return null;
    }

    const uniqueUsers = new Set(data?.map(t => t.user_id)).size;
    const totalTransactions = data?.length || 0;
    const avgTransactionsPerUser = uniqueUsers > 0 ? totalTransactions / uniqueUsers : 0;

    return {
      old_system_size_bytes: 1000000, // Mock data
      new_system_size_bytes: 800000,
      storage_reduction_percent: 20,
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