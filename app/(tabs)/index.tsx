import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { useAdFreeStore } from '../../store/adFreeStore';
import { awardCoinsForVideoCompletion } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import { ExternalLink } from 'lucide-react-native';

const { width: screenWidth } = Dimensions.get('window');

export default function ViewTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { videoQueue, currentVideoIndex, isLoading, fetchVideos, getCurrentVideo, moveToNextVideo, handleVideoError } = useVideoStore();
  const { isAdFreeActive, updateTimer } = useAdFreeStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [videoStartTime, setVideoStartTime] = useState(0);
  const [canEarnCoins, setCanEarnCoins] = useState(false);
  const [adCounter, setAdCounter] = useState(0);
  const webViewRef = useRef<WebView>(null);

  const currentVideo = getCurrentVideo();

  useEffect(() => {
    if (user && !isLoading && videoQueue.length === 0) {
      fetchVideos(user.id);
    }
  }, [user, isLoading, videoQueue.length, fetchVideos]);

  useEffect(() => {
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [updateTimer]);

  useEffect(() => {
    if (currentVideo) {
      const duration = currentVideo.duration_seconds;
      const requiredWatchTime = Math.floor(duration * 0.95); // 95% completion
      setSecondsRemaining(requiredWatchTime);
      setWatchedSeconds(0);
      setVideoStartTime(Date.now());
      setCanEarnCoins(false);
      
      // Start countdown
      const interval = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            setCanEarnCoins(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
        
        setWatchedSeconds(prev => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [currentVideo]);

  const handleVideoCompletion = async () => {
    if (!currentVideo || !user || !canEarnCoins) return;

    try {
      const result = await awardCoinsForVideoCompletion(
        user.id,
        currentVideo.video_id,
        watchedSeconds
      );

      if (result && result.success) {
        Alert.alert(
          'Coins Earned!',
          `You earned ${currentVideo.coin_reward} coins!`,
          [{ text: 'OK', onPress: () => {
            refreshProfile();
            moveToNextVideo();
          }}]
        );
      } else {
        Alert.alert('Error', 'Failed to award coins. Please try again.');
      }
    } catch (error) {
      console.error('Error awarding coins:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleSkipVideo = () => {
    const performSkip = () => {
      moveToNextVideo();
      
      // Show ad after every 5 videos if not ad-free
      if (!isAdFreeActive) {
        setAdCounter(prev => {
          const newCount = prev + 1;
          if (newCount >= 5) {
            Alert.alert(
              'Advertisement',
              'You will see an ad after watching 5 videos. CONFIGURE?',
              [
                { text: 'Later', style: 'cancel' },
                { text: 'Configure', onPress: () => {
                  // Navigate to ad configuration
                }}
              ]
            );
            return 0;
          }
          return newCount;
        });
      }
    };

    Alert.alert(
      'Skip Video',
      'Are you sure you want to skip this video? You won\'t earn any coins.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: performSkip }
      ]
    );
  };

  const openInYouTube = () => {
    if (currentVideo) {
      Alert.alert(
        'Open in YouTube',
        'This will open the video in YouTube app',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => {
            // YouTube app would open here
          }}
        ]
      );
    }
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

  const getEmbedUrl = (youtubeUrl: string) => {
    const videoId = youtubeUrl.split('v=')[1]?.split('&')[0] || youtubeUrl.split('/').pop();
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0`;
  };

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
          source={{ uri: getEmbedUrl(currentVideo.youtube_url) }}
          style={styles.webView}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onError={() => handleVideoError(currentVideo.video_id)}
        />
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.youtubeButton} onPress={openInYouTube}>
          <ExternalLink size={20} color="#666" />
          <Text style={styles.youtubeButtonText}>Open on Youtube</Text>
          <View style={styles.autoPlayContainer}>
            <Text style={styles.autoPlayText}>Auto Play</Text>
            <View style={styles.toggle}>
              <View style={styles.toggleActive} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{secondsRemaining}</Text>
            <Text style={styles.statLabel}>Seconds to get coins</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{currentVideo.coin_reward}</Text>
            <Text style={styles.statLabel}>Coins will be added</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.skipButton, canEarnCoins && styles.earnButton]}
          onPress={canEarnCoins ? handleVideoCompletion : handleSkipVideo}
        >
          <Text style={styles.skipButtonText}>
            {canEarnCoins ? 'EARN COINS' : 'SKIP VIDEO'}
          </Text>
        </TouchableOpacity>

        {!isAdFreeActive && (
          <View style={styles.adNotice}>
            <Text style={styles.adNoticeText}>
              You will see an Ad after watching 5 Videos. CONFIGURE?
            </Text>
          </View>
        )}
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
    margin: 0,
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
    width: 40,
    height: 20,
    backgroundColor: '#FF4757',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  toggleActive: {
    width: 16,
    height: 16,
    backgroundColor: 'white',
    borderRadius: 8,
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
    backgroundColor: '#E0E0E0',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  earnButton: {
    backgroundColor: '#2ECC71',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  adNotice: {
    backgroundColor: '#FF4757',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  adNoticeText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
});