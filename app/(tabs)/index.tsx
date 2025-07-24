import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { updateUserCoins } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import { ExternalLink, Play, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function ViewTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { videoQueue, currentVideoIndex, isLoading, fetchVideos, getCurrentVideo, moveToNextVideo, handleVideoError, clearQueue } = useVideoStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [watchTimer, setWatchTimer] = useState(0);
  const [targetTimer, setTargetTimer] = useState(0);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
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
      initializeTimer();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentVideo]);

  const initializeTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (!currentVideo) return;

    // Simple timer - just use the video duration as target
    const targetTime = currentVideo.duration_seconds;
    
    setTargetTimer(targetTime);
    setWatchTimer(0);
    setCoinsEarned(false);

    timerRef.current = setInterval(() => {
      setWatchTimer(prev => {
        const newTimer = prev + 1;
        
        // When timer reaches target, automatically earn coins
        if (newTimer >= targetTime && !coinsEarned && autoPlayEnabled) {
          setTimeout(() => handleTimerComplete(), 100);
        }
        
        return newTimer;
      });
    }, 1000);
  };

  const handleTimerComplete = async () => {
    if (isTransitioning || coinsEarned) return;
    
    setIsTransitioning(true);
    setCoinsEarned(true);
    
    try {
      if (currentVideo && user) {
        console.log('Timer completed - awarding coins for video:', {
          videoId: currentVideo.video_id,
          watchTimer,
          targetTimer,
          userId: user.id
        });
        
        // Award coins directly using the simple update function
        const result = await updateUserCoins(
          user.id,
          currentVideo.coin_reward,
          'video_watch',
          `Watched video: ${currentVideo.title}`,
          currentVideo.video_id
        );

        console.log('Coin award result:', result);
        
        if (result?.success) {
          console.log('✅ Coins awarded successfully:', currentVideo.coin_reward);
          await refreshProfile();
          
          // Record the view in database
          await recordVideoView(currentVideo.video_id, watchTimer, true);
        } else {
          console.error('❌ Failed to award coins:', result?.error);
        }
      }
      
      // Auto-advance to next video
      if (autoPlayEnabled) {
        setTimeout(() => {
          moveToNextVideo();
          
          if (videoQueue.length <= 2 && user) {
            fetchVideos(user.id);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error during timer completion:', error);
      if (currentVideo) {
        handleVideoError(currentVideo.video_id);
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  const recordVideoView = async (videoId: string, duration: number, completed: boolean) => {
    try {
      // This is a simplified view recording - in a real app you'd have a proper function
      console.log('Recording video view:', { videoId, duration, completed });
    } catch (error) {
      console.error('Error recording video view:', error);
    }
  };

  const handleManualSkip = () => {
    if (isTransitioning) return;
    
    if (watchTimer >= targetTimer || coinsEarned) {
      // If timer is complete or coins already earned, just move to next
      moveToNextVideo();
      if (videoQueue.length <= 2 && user) {
        fetchVideos(user.id);
      }
    } else {
      Alert.alert(
        'Skip Video',
        `You need to watch ${targetTimer - watchTimer} more seconds to earn coins. Skip anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip', onPress: () => {
            moveToNextVideo();
            if (videoQueue.length <= 2 && user) {
              fetchVideos(user.id);
            }
          }}
        ]
      );
    }
  };

  const togglePlayPause = () => {
    const newPlayState = !isPlaying;
    setIsPlaying(newPlayState);
    
    if (webViewRef.current) {
      const command = newPlayState ? 'play' : 'pause';
      webViewRef.current.postMessage(JSON.stringify({ action: command }));
    }
  };

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    
    if (webViewRef.current) {
      const command = newMuteState ? 'mute' : 'unmute';
      webViewRef.current.postMessage(JSON.stringify({ action: command }));
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
          .overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; }
        </style>
      </head>
      <body>
        <iframe
          src="https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>
        <div class="overlay"></div>
      </body>
      </html>
    `;
  };

  const getProgressPercentage = () => {
    if (targetTimer === 0) return 0;
    return Math.min((watchTimer / targetTimer) * 100, 100);
  };

  const getRemainingTime = () => {
    return Math.max(0, targetTimer - watchTimer);
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

        <View style={styles.controlOverlay}>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${getProgressPercentage()}%`,
                    backgroundColor: coinsEarned ? '#FFD700' : '#2ECC71'
                  }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {formatTime(watchTimer)} / {formatTime(targetTimer)}
            </Text>
          </View>

          <View style={styles.controlButtons}>
            <TouchableOpacity style={styles.controlButton} onPress={togglePlayPause}>
              {isPlaying ? <Pause size={24} color="white" /> : <Play size={24} color="white" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
              {isMuted ? <VolumeX size={24} color="white" /> : <Volume2 size={24} color="white" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={handleManualSkip}>
              <SkipForward size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {isTransitioning && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.transitionText}>
              {coinsEarned ? 'Coins earned! Loading next video...' : 'Loading next video...'}
            </Text>
          </View>
        )}

        {coinsEarned && (
          <View style={styles.coinEarnedOverlay}>
            <Text style={styles.coinEarnedText}>🪙 +{currentVideo.coin_reward} Coins Earned!</Text>
          </View>
        )}
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
            <Text style={[styles.statNumber, coinsEarned && styles.statNumberEarned]}>
              {coinsEarned ? '✓' : getRemainingTime()}
            </Text>
            <Text style={styles.statLabel}>
              {coinsEarned ? 'Coins Earned!' : 'Seconds to earn coins'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, coinsEarned && styles.statNumberEarned]}>
              {currentVideo.coin_reward}
            </Text>
            <Text style={styles.statLabel}>
              {coinsEarned ? 'Coins Added' : 'Coins to earn'}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[
            styles.skipButton,
            coinsEarned ? styles.earnedButton : 
            watchTimer >= targetTimer ? styles.earnButton : styles.waitButton
          ]}
          onPress={handleManualSkip}
          disabled={isTransitioning}
        >
          <Text style={styles.skipButtonText}>
            {isTransitioning ? 'LOADING...' : 
             coinsEarned ? 'COINS EARNED - NEXT VIDEO' :
             watchTimer >= targetTimer ? 'EARN COINS NOW' : 
             autoPlayEnabled ? `AUTO-EARN IN ${getRemainingTime()}s` : 'SKIP VIDEO'}
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
  controlOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 80,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  controlButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transitionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  coinEarnedOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.9)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  coinEarnedText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
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