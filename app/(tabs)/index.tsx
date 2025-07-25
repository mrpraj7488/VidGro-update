import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { processVideoCompletion } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import { ExternalLink } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function ViewTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { videoQueue, currentVideoIndex, isLoading, fetchVideos, getCurrentVideo, moveToNextVideo, handleVideoError, clearQueue } = useVideoStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [watchTimer, setWatchTimer] = useState(0);
  const [targetTimer, setTargetTimer] = useState(0);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  const webViewRef = useRef<WebView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rewardProcessedRef = useRef<boolean>(false);
  const currentVideo = getCurrentVideo();

  useFocusEffect(
    useCallback(() => {
      if (user && !isLoading && videoQueue.length === 0) {
        fetchVideos(user.id);
      }
    }, [user, isLoading, videoQueue.length, fetchVideos])
  );

  useEffect(() => {
    if (currentVideo) {
      // Reset states when video changes
      if (currentVideoId !== currentVideo.video_id) {
        console.log('🎬 New video loaded:', currentVideo.video_id);
        setCurrentVideoId(currentVideo.video_id);
        rewardProcessedRef.current = false;
      }
      initializeTimer();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentVideo, currentVideoId]);

  const initializeTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (!currentVideo) return;

    // Reset timer
    setWatchTimer(0);
    setTargetTimer(currentVideo.duration_seconds);

    console.log('⏱️ Timer initialized:', {
      videoId: currentVideo.video_id,
      duration: currentVideo.duration_seconds,
      rewardProcessed: rewardProcessedRef.current
    });

    // Start the timer
    timerRef.current = setInterval(() => {
      setWatchTimer(prev => {
        const newTimer = prev + 1;
        
        // Simple check: timer completed and reward not processed
        if (newTimer >= currentVideo.duration_seconds && 
            !rewardProcessedRef.current &&
            autoPlayEnabled) {
          
          console.log('⏰ Timer completed, processing reward...');
          handleTimerComplete();
        }
        
        return newTimer;
      });
    }, 1000);
  };

  const handleTimerComplete = async () => {
    // Simple duplicate prevention
    if (rewardProcessedRef.current || !currentVideo || !user) {
      console.log('⚠️ Reward processing blocked:', {
        rewardProcessed: rewardProcessedRef.current,
        hasVideo: !!currentVideo,
        hasUser: !!user
      });
      return;
    }
    
    // Set flag to prevent duplicates
    rewardProcessedRef.current = true;

    console.log('🎯 Processing reward for video:', {
      videoId: currentVideo.video_id,
      watchTimer,
      targetTimer: currentVideo.duration_seconds,
      userId: user.id
    });

    try {
      // Process video completion with coin_transactions system
      const result = await processVideoCompletion(
        user.id,
        currentVideo.video_id,
        currentVideo.duration_seconds
      );

      console.log('Coin award result:', result);
      
      if (result.success) {
        console.log('✅ Coins awarded successfully');
        
        // Refresh profile silently
        await refreshProfile();
        
        // Auto-advance to next video after brief delay
        if (autoPlayEnabled) {
          setTimeout(() => {
            moveToNextVideo();
            
            // Fetch more videos if queue is low
            if (videoQueue.length <= 2 && user) {
              fetchVideos(user.id);
            }
          }, 1500);
        }
      } else {
        console.error('❌ Coin award failed:', result.error);
        // Reset flag if failed so user can retry
        rewardProcessedRef.current = false;
        
        // Show more specific error messages
        if (result.error?.includes('already completed')) {
          Alert.alert('Already Completed', 'You have already completed this video.');
        } else if (result.error?.includes('Insufficient watch time')) {
          Alert.alert('Watch Complete', 'Please watch the full video to earn coins.');
        } else {
          Alert.alert('Error', 'Failed to award coins. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error during timer completion:', error);
      // Reset flag if error occurred
      rewardProcessedRef.current = false;
      if (currentVideo) {
        handleVideoError(currentVideo.video_id);
      }
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleManualSkip = () => {
    if (rewardProcessedRef.current) return;
    
    if (watchTimer >= targetTimer) {
      // Timer completed or coins earned, move to next
      moveToNextVideo();
      if (videoQueue.length <= 2 && user) {
        fetchVideos(user.id);
      }
    } else {
      // Timer not completed, ask for confirmation
      const remainingTime = targetTimer - watchTimer;
      Alert.alert(
        'Skip Video',
        `You need to watch ${remainingTime} more seconds to earn coins. Skip anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip', onPress: () => {
            // Reset flag when manually skipping
            rewardProcessedRef.current = false;
            moveToNextVideo();
            if (videoQueue.length <= 2 && user) {
              fetchVideos(user.id);
            }
          }}
        ]
      );
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const createHtmlContent = (youtubeVideoId: string) => {
    if (!youtubeVideoId || youtubeVideoId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(youtubeVideoId)) {
      return `
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="background: #000; margin: 0; padding: 0;">
          <div style="color: white; text-align: center; padding: 50px;">Video unavailable</div>
        </body>
        </html>
      `;
    }
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #000; overflow: hidden; position: fixed; width: 100%; height: 100%; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <iframe
          src="https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>
      </body>
      </html>
    `;
  };

  const getRemainingTime = () => {
    return Math.max(0, targetTimer - watchTimer);
  };

  const getButtonState = () => {
    if (watchTimer >= targetTimer) {
      if (!rewardProcessedRef.current) {
        return { text: 'EARN COINS NOW', style: styles.earnButton, disabled: false };
      } else {
        return { text: 'COINS EARNED - NEXT VIDEO', style: styles.earnedButton, disabled: false };
      }
    }
    
    if (autoPlayEnabled) {
      return { text: `AUTO-EARN IN ${getRemainingTime()}s`, style: styles.waitButton, disabled: true };
    }
    
    return { text: 'SKIP VIDEO', style: styles.waitButton, disabled: false };
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlobalHeader 
          title="View" 
          showCoinDisplay={true}
          menuVisible={menuVisible} 
          setMenuVisible={setMenuVisible} 
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading videos...</Text>
        </View>
      </View>
    );
  }

  if (!currentVideo) {
    return (
      <View style={styles.container}>
        <GlobalHeader 
          title="View" 
          showCoinDisplay={true}
          menuVisible={menuVisible} 
          setMenuVisible={setMenuVisible} 
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No videos available</Text>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={() => user && fetchVideos(user.id)}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const buttonState = getButtonState();

  return (
    <View style={styles.container}>
      <GlobalHeader 
        title="View" 
        showCoinDisplay={true}
        menuVisible={menuVisible} 
        setMenuVisible={setMenuVisible} 
      />
      
      <View style={styles.videoContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: createHtmlContent(currentVideo.youtube_url) }}
          style={styles.webView}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          bounces={false}
          onError={() => currentVideo && handleVideoError(currentVideo.video_id)}
        />
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.youtubeButton}>
          <ExternalLink size={20} color="#666" />
          <Text style={styles.youtubeButtonText}>Open on Youtube</Text>
          <View style={styles.autoPlayContainer}>
            <Text style={styles.autoPlayText}>Auto Play</Text>
            <TouchableOpacity style={styles.toggle} onPress={() => setAutoPlayEnabled(!autoPlayEnabled)}>
              <View style={[styles.toggleSlider, autoPlayEnabled && styles.toggleActive]} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, rewardProcessedRef.current && styles.statNumberEarned]}>
              {rewardProcessedRef.current ? '✓' : getRemainingTime()}
            </Text>
            <Text style={styles.statLabel}>
              {rewardProcessedRef.current ? 'Coins Earned!' : 'Seconds to earn coins'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, rewardProcessedRef.current && styles.statNumberEarned]}>
              {rewardProcessedRef.current ? '✓' : 3}
            </Text>
            <Text style={styles.statLabel}>
              {rewardProcessedRef.current ? 'Coins Added' : 'Coins to earn'}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.skipButton, buttonState.style]}
          onPress={handleManualSkip}
          disabled={buttonState.disabled}
        >
          <Text style={styles.skipButtonText}>
            {buttonState.text}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#800080',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  videoContainer: {
    height: 250,
    backgroundColor: 'black',
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  controlsContainer: {
    flex: 1,
    padding: 20,
  },
  youtubeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 24,
    justifyContent: 'space-between',
  },
  youtubeButtonText: {
    fontSize: 16,
    color: '#666',
    flex: 1,
    marginLeft: 8,
  },
  autoPlayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoPlayText: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  toggle: {
    width: 50,
    height: 24,
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    justifyContent: 'center',
    padding: 2,
  },
  toggleSlider: {
    width: 20,
    height: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleActive: {
    backgroundColor: '#2ECC71',
    alignSelf: 'flex-end',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 32,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  statNumberEarned: {
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  skipButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  earnButton: {
    backgroundColor: '#2ECC71',
  },
  earnedButton: {
    backgroundColor: '#FFD700',
  },
  waitButton: {
    backgroundColor: '#E0E0E0',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
