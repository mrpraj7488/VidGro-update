import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { awardCoinsForVideoCompletion, processVideoQueueMaintenance } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import { ExternalLink, Play, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function ViewTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { videoQueue, currentVideoIndex, isLoading, fetchVideos, getCurrentVideo, moveToNextVideo, handleVideoError, clearQueue } = useVideoStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [watchDuration, setWatchDuration] = useState(0);
  const [targetDuration, setTargetDuration] = useState(0);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const watchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideo = getCurrentVideo();

  useFocusEffect(
    useCallback(() => {
      if (user && !isLoading && videoQueue.length === 0) {
        fetchVideos(user.id);
      }
      
      // Check for expired holds when tab is focused
      if (user) {
        processVideoQueueMaintenance().then(() => {
          // Refresh video queue if any videos were activated
          if (videoQueue.length === 0) {
            fetchVideos(user.id);
          }
        });
      }
    }, [user, isLoading, videoQueue.length, fetchVideos])
  );

  useEffect(() => {
    if (currentVideo) {
      initializeWatchTimer();
    }
    return () => {
      if (watchTimerRef.current) {
        clearInterval(watchTimerRef.current);
      }
    };
  }, [currentVideo]);

  const initializeWatchTimer = () => {
    if (watchTimerRef.current) {
      clearInterval(watchTimerRef.current);
    }

    if (!currentVideo) return;

    const duration = currentVideo.duration_seconds;
    const requiredWatchTime = Math.floor(duration * 0.95);

    setTargetDuration(requiredWatchTime);
    setWatchDuration(0);

    watchTimerRef.current = setInterval(() => {
      setWatchDuration(prev => {
        const newDuration = prev + 1;
        
        if (newDuration >= requiredWatchTime && autoPlayEnabled) {
          setTimeout(() => handleAutoSkip(), 100);
        }
        
        return newDuration;
      });
    }, 1000);
  };

  const handleAutoSkip = async () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    
    try {
      if (currentVideo && user) {
        const result = await awardCoinsForVideoCompletion(
          user.id,
          currentVideo.video_id,
          watchDuration
        );

        if (result?.success) {
          await refreshProfile();
        }
      }
      
      moveToNextVideo();
      
      if (videoQueue.length <= 2 && user) {
        fetchVideos(user.id);
      }
    } catch (error) {
      console.error('Error during auto-skip:', error);
      if (currentVideo) {
        handleVideoError(currentVideo.video_id);
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleManualSkip = () => {
    if (isTransitioning) return;
    
    if (watchDuration >= targetDuration) {
      handleAutoSkip();
    } else {
      Alert.alert(
        'Skip Video',
        'Are you sure you want to skip this video? You won\'t earn full coins.',
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
    if (targetDuration === 0) return 0;
    return Math.min((watchDuration / targetDuration) * 100, 100);
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
                style={[styles.progressFill, { width: `${getProgressPercentage()}%` }]} 
              />
            </View>
            <Text style={styles.progressText}>
              {formatTime(watchDuration)} / {formatTime(targetDuration)}
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
            <Text style={styles.transitionText}>Loading next video...</Text>
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
            <Text style={styles.statNumber}>{targetDuration - watchDuration}</Text>
            <Text style={styles.statLabel}>Seconds to get coins</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{currentVideo.coin_reward}</Text>
            <Text style={styles.statLabel}>Coins will be added</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[
            styles.skipButton,
            watchDuration >= targetDuration ? styles.earnButton : styles.waitButton
          ]}
          onPress={handleManualSkip}
          disabled={isTransitioning}
        >
          <Text style={styles.skipButtonText}>
            {isTransitioning ? 'LOADING...' : 
             watchDuration >= targetDuration ? 'EARN COINS' : 
             autoPlayEnabled ? `AUTO-SKIP IN ${targetDuration - watchDuration}s` : 'SKIP VIDEO'}
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
    backgroundColor: '#2ECC71',
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
  waitButton: {
    backgroundColor: '#E0E0E0',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});