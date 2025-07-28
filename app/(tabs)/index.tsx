import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { awardCoinsForVideo } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import { ExternalLink } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function ViewTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { videoQueue, currentVideoIndex, isLoading, fetchVideos, getCurrentVideo, moveToNextVideo } = useVideoStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [watchTimer, setWatchTimer] = useState(0);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState(true);
  const autoSkipEnabledRef = useRef(autoSkipEnabled);
  
  useEffect(() => {
    autoSkipEnabledRef.current = autoSkipEnabled;
  }, [autoSkipEnabled]);

  const [isProcessingReward, setIsProcessingReward] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [timerPaused, setTimerPaused] = useState(true);
  const [videoLoadedSuccessfully, setVideoLoadedSuccessfully] = useState(false);
  
  const watchTimerRef = useRef(0);
  const isVideoPlayingRef = useRef(false);
  const videoLoadedRef = useRef(false);
  const timerPausedRef = useRef(true);
  
  const webViewRef = useRef<WebView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoRef = useRef<string | null>(null);
  const rewardProcessedRef = useRef(false);
  
  const videoLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const currentVideo = getCurrentVideo();

  const createHtmlContent = (youtubeVideoId: string) => {
    if (!youtubeVideoId || youtubeVideoId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(youtubeVideoId)) {
      return `
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="background: #000; margin: 0; padding: 0;">
          <div style="color: white; text-align: center; padding: 50px;">Video unavailable</div>
          <script>
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoUnavailable' }));
            }
          </script>
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
          body { 
            background: #000; 
            overflow: hidden; 
            position: fixed; 
            width: 100%; 
            height: 100%; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          
          #video-container {
            position: relative;
            width: 100%;
            height: 100%;
          }
          
          #youtube-player { 
            width: 100%; 
            height: 100%; 
            border: none; 
            pointer-events: none;
          }
          
          #security-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: transparent;
            z-index: 1000;
            cursor: pointer;
          }
          
          #play-pause-button {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 68px;
            height: 48px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 1001;
            opacity: 0.9;
            transition: none;
            pointer-events: auto;
          }
          
          .play-icon {
            width: 0;
            height: 0;
            border-left: 16px solid #fff;
            border-top: 11px solid transparent;
            border-bottom: 11px solid transparent;
            margin-left: 3px;
          }
          
          .pause-icon {
            width: 14px;
            height: 18px;
            position: relative;
          }
          
          .pause-icon::before,
          .pause-icon::after {
            content: '';
            position: absolute;
            width: 4px;
            height: 18px;
            background: #fff;
            border-radius: 1px;
          }
          
          .pause-icon::before { left: 2px; }
          .pause-icon::after { right: 2px; }
          
          .playing #play-pause-button {
            opacity: 0;
            pointer-events: none;
          }
          
          .paused #play-pause-button {
            opacity: 0.9;
            pointer-events: auto;
          }
          
          .timer-complete #play-pause-button {
            opacity: 0;
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <div id="video-container" class="paused">
          <iframe
            id="youtube-player"
            src="https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&showinfo=0&theme=dark&enablejsapi=1&mute=0&loop=0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            frameborder="0"
            scrolling="no">
          </iframe>
          
          <div id="security-overlay"></div>
          <div id="play-pause-button"><div class="play-icon"></div></div>
        </div>
        
        <script>
          (function() {
            'use strict';
            
            let player = null;
            let isPlaying = false;
            let playerReady = false;
            let timerCompleted = false;
            let videoUnavailable = false;
            let unavailabilityChecked = false;
            
            const securityOverlay = document.getElementById('security-overlay');
            const playPauseButton = document.getElementById('play-pause-button');
            const videoContainer = document.getElementById('video-container');
            
            function markVideoUnavailable() {
              if (videoUnavailable || unavailabilityChecked) return;
              
              unavailabilityChecked = true;
              videoUnavailable = true;
              notifyReactNative('videoUnavailable');
            }
            
            function checkIframeAvailability() {
              const iframe = document.getElementById('youtube-player');
              if (!iframe || !iframe.src) {
                markVideoUnavailable();
                return;
              }
              
              iframe.onerror = function() {
                markVideoUnavailable();
              };
              
              setTimeout(() => {
                if (!playerReady && !videoUnavailable) {
                  markVideoUnavailable();
                }
              }, 3000);
            }
            
            checkIframeAvailability();
            
            window.addEventListener('message', function(event) {
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                
                if (data.type === 'timerComplete') {
                  timerCompleted = true;
                  forceVideoPause();
                }
                
                if (data.type === 'forcePlay' && playerReady && player && !timerCompleted) {
                  player.playVideo();
                }
                
                if (data.type === 'forcePause' && playerReady && player) {
                  player.pauseVideo();
                }
              } catch (e) {
                // Silent error handling
              }
            });
            
            if (!window.YT) {
              const tag = document.createElement('script');
              tag.src = 'https://www.youtube.com/iframe_api';
              tag.onerror = function() {
                markVideoUnavailable();
              };
              
              const firstScriptTag = document.getElementsByTagName('script')[0];
              firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
              
              setTimeout(() => {
                if (!window.YT || !window.YT.Player) {
                  markVideoUnavailable();
                }
              }, 2500);
            } else {
              setTimeout(() => window.onYouTubeIframeAPIReady(), 100);
            }
            
            window.onYouTubeIframeAPIReady = function() {
              if (videoUnavailable) return;
              
              try {
                player = new YT.Player('youtube-player', {
                  events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange,
                    'onError': onPlayerError
                  }
                });
              } catch (e) {
                markVideoUnavailable();
              }
            };
            
            function onPlayerReady(event) {
              if (videoUnavailable) return;
              
              playerReady = true;
              
              try {
                const videoData = event.target.getVideoData();
                
                if (!videoData || 
                    !videoData.title || 
                    videoData.title === '' || 
                    videoData.title === 'YouTube' ||
                    videoData.errorCode) {
                  markVideoUnavailable();
                  return;
                }
                
                event.target.playVideo();
                notifyReactNative('videoLoaded');
                
              } catch (e) {
                markVideoUnavailable();
              }
            }
            
            function onPlayerStateChange(event) {
              if (videoUnavailable) return;
              
              const state = event.data;
              
              switch (state) {
                case YT.PlayerState.PLAYING:
                  updatePlayerState(true);
                  notifyReactNative('videoPlaying');
                  break;
                  
                case YT.PlayerState.PAUSED:
                  updatePlayerState(false);
                  notifyReactNative('videoPaused');
                  break;
                  
                case YT.PlayerState.BUFFERING:
                  break;
                  
                case YT.PlayerState.ENDED:
                  updatePlayerState(false);
                  notifyReactNative('videoEnded');
                  break;
                  
                case YT.PlayerState.CUED:
                  break;
              }
            }
            
            function onPlayerError(event) {
              const errorCode = event.data;
              const unavailableErrors = [2, 5, 100, 101, 150];
              
              if (unavailableErrors.includes(errorCode)) {
                markVideoUnavailable();
              } else {
                notifyReactNative('videoError', { errorCode });
              }
            }
            
            function updatePlayerState(playing) {
              isPlaying = playing;
              const icon = playPauseButton.querySelector('.play-icon, .pause-icon');
              
              if (playing) {
                icon.className = 'pause-icon';
                videoContainer.classList.add('playing');
                videoContainer.classList.remove('paused');
              } else {
                icon.className = 'play-icon';
                videoContainer.classList.add('paused');
                videoContainer.classList.remove('playing');
              }
            }
            
            function togglePlayPause() {
              if (!playerReady || !player || timerCompleted || videoUnavailable) return;
              
              try {
                if (isPlaying) {
                  player.pauseVideo();
                } else {
                  player.playVideo();
                }
              } catch (e) {
                // Silent error handling
              }
            }
            
            function forceVideoPause() {
              if (playerReady && player) {
                try {
                  player.pauseVideo();
                  videoContainer.classList.add('timer-complete');
                } catch (e) {
                  // Silent error handling
                }
              }
            }
            
            function notifyReactNative(type, data = {}) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: type, 
                  ...data 
                }));
              }
            }
            
            playPauseButton.addEventListener('click', function(e) {
              e.stopPropagation();
              togglePlayPause();
            });
            
            securityOverlay.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              if (!timerCompleted) togglePlayPause();
            });
            
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('selectstart', e => e.preventDefault());
            
            document.addEventListener('keydown', function(e) {
              if (timerCompleted) {
                e.preventDefault();
                return false;
              }
              
              if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
                return false;
              }
              
              if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault();
                return false;
              }
            });
          })();
        </script>
      </body>
      </html>
    `;
  };

  useFocusEffect(
    useCallback(() => {
      if (user && !isLoading && videoQueue.length === 0) {
        fetchVideos(user.id);
      }
    }, [user, isLoading, videoQueue.length, fetchVideos])
  );

  const skipToNextVideo = useCallback(() => {
    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
      videoLoadTimeoutRef.current = null;
    }
    if (playingTimeoutRef.current) {
      clearTimeout(playingTimeoutRef.current);
      playingTimeoutRef.current = null;
    }
    if (autoSkipTimeoutRef.current) {
      clearTimeout(autoSkipTimeoutRef.current);
      autoSkipTimeoutRef.current = null;
    }
    
    if (videoQueue.length === 0) {
      if (user) {
        fetchVideos(user.id);
      }
      return;
    }
    
    moveToNextVideo();
    
    if (videoQueue.length <= 3 && user) {
      fetchVideos(user.id);
    }
  }, [moveToNextVideo, videoQueue.length, user, fetchVideos]);

  const processReward = useCallback(async () => {
    if (!currentVideo || !user || isProcessingReward) {
      return;
    }

    setIsProcessingReward(true);

    try {
      const result = await awardCoinsForVideo(
        user.id,
        currentVideo.video_id,
        currentVideo.duration_seconds
      );

      if (result.success) {
        await refreshProfile();
        
        if (autoSkipEnabledRef.current) {
          autoSkipTimeoutRef.current = setTimeout(() => {
            moveToNextVideo();
            if (videoQueue.length <= 3) {
              fetchVideos(user.id);
            }
          }, 1500);
        }
      }
    } catch (error) {
      // Silent error handling
    } finally {
      setIsProcessingReward(false);
    }
  }, [currentVideo, user, isProcessingReward, refreshProfile, moveToNextVideo, videoQueue.length, fetchVideos]);

  useEffect(() => {
    if (!currentVideo || currentVideoRef.current === currentVideo.video_id) {
      return;
    }

    currentVideoRef.current = currentVideo.video_id;
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
      videoLoadTimeoutRef.current = null;
    }
    
    if (playingTimeoutRef.current) {
      clearTimeout(playingTimeoutRef.current);
      playingTimeoutRef.current = null;
    }

    if (autoSkipTimeoutRef.current) {
      clearTimeout(autoSkipTimeoutRef.current);
      autoSkipTimeoutRef.current = null;
    }

    setWatchTimer(0);
    watchTimerRef.current = 0;
    setIsProcessingReward(false);
    setVideoError(false);
    setIsVideoPlaying(false);
    isVideoPlayingRef.current = false;
    setTimerPaused(true);
    timerPausedRef.current = true;
    setVideoLoadedSuccessfully(false);
    videoLoadedRef.current = false;
    rewardProcessedRef.current = false;

    videoLoadTimeoutRef.current = setTimeout(() => {
      if (!videoLoadedRef.current) {
        setVideoError(true);
        skipToNextVideo();
      }
    }, 3000);

    const earlyDetectionTimeout = setTimeout(() => {
      if (!videoLoadedRef.current && !videoError) {
        setVideoError(true);
        skipToNextVideo();
      }
    }, 1500);

    timerRef.current = setInterval(() => {
      const isPaused = timerPausedRef.current;
      const isLoaded = videoLoadedRef.current;
      const isPlaying = isVideoPlayingRef.current;
      
      if (!isPaused && isLoaded && isPlaying) {
        watchTimerRef.current += 1;
        const newTime = watchTimerRef.current;
        
        setWatchTimer(newTime);
        
        const targetDuration = currentVideo.duration_seconds;
        
        if (newTime >= targetDuration) {
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({ type: 'timerComplete' }));
          }
          
          if (!rewardProcessedRef.current) {
            rewardProcessedRef.current = true;
            processReward();
          }
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
        videoLoadTimeoutRef.current = null;
      }
      
      if (playingTimeoutRef.current) {
        clearTimeout(playingTimeoutRef.current);
        playingTimeoutRef.current = null;
      }

      if (autoSkipTimeoutRef.current) {
        clearTimeout(autoSkipTimeoutRef.current);
        autoSkipTimeoutRef.current = null;
      }

      clearTimeout(earlyDetectionTimeout);
    };
  }, [currentVideo?.video_id, processReward, skipToNextVideo]);

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'videoLoaded':
          setVideoLoadedSuccessfully(true);
          videoLoadedRef.current = true;
          setVideoError(false);
          
          if (videoLoadTimeoutRef.current) {
            clearTimeout(videoLoadTimeoutRef.current);
            videoLoadTimeoutRef.current = null;
          }
          
          playingTimeoutRef.current = setTimeout(() => {
            if (!isVideoPlayingRef.current && !videoError && videoLoadedRef.current) {
              setVideoError(true);
              skipToNextVideo();
            }
          }, 5000);
          
          break;

        case 'videoPlaying':
          if (playingTimeoutRef.current) {
            clearTimeout(playingTimeoutRef.current);
            playingTimeoutRef.current = null;
          }
          
          setIsVideoPlaying(true);
          isVideoPlayingRef.current = true;
          setTimerPaused(false);
          timerPausedRef.current = false;
          setVideoLoadedSuccessfully(true);
          videoLoadedRef.current = true;
          setVideoError(false);
          
          break;
          
        case 'videoPaused':
          setIsVideoPlaying(false);
          isVideoPlayingRef.current = false;
          setTimerPaused(true);
          timerPausedRef.current = true;
          break;
          
        case 'videoEnded':
          setIsVideoPlaying(false);
          isVideoPlayingRef.current = false;
          setTimerPaused(true);
          timerPausedRef.current = true;
          break;
          
        case 'videoUnavailable':
          setVideoError(true);
          skipToNextVideo();
          break;
          
        case 'videoError':
          setVideoError(true);
          skipToNextVideo();
          break;
      }
    } catch (e) {
      setTimeout(() => {
        skipToNextVideo();
      }, 1000);
    }
  };

  const handleManualSkip = () => {
    if (!currentVideo) return;

    if (autoSkipTimeoutRef.current) {
      clearTimeout(autoSkipTimeoutRef.current);
      autoSkipTimeoutRef.current = null;
    }

    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
      videoLoadTimeoutRef.current = null;
    }
    if (playingTimeoutRef.current) {
      clearTimeout(playingTimeoutRef.current);
      playingTimeoutRef.current = null;
    }

    const targetDuration = currentVideo.duration_seconds;
    
    if (watchTimerRef.current >= targetDuration && !rewardProcessedRef.current) {
      rewardProcessedRef.current = true;
      processReward();
    } else {
      skipToNextVideo();
    }
  };

  const handleOpenYouTube = () => {
    if (currentVideo && currentVideo.youtube_url) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${currentVideo.youtube_url}`;
      Linking.openURL(youtubeUrl).catch(err => {
        Alert.alert('Error', 'Could not open YouTube video');
      });
    }
  };

  const getRemainingTime = () => {
    const targetDuration = currentVideo?.duration_seconds || 0;
    return Math.max(0, targetDuration - watchTimerRef.current);
  };

  const getButtonState = () => {
    const targetDuration = currentVideo?.duration_seconds || 0;
    
    if (watchTimerRef.current >= targetDuration) {
      if (isProcessingReward) {
        return { text: 'PROCESSING REWARD...', style: styles.processingButton, disabled: false };
      } else if (rewardProcessedRef.current) {
        return { text: `COINS EARNED! TAP TO CONTINUE`, style: styles.earnedButton, disabled: false };
      } else {
        return { text: `EARN ${currentVideo?.coin_reward || 0} COINS NOW`, style: styles.earnButton, disabled: false };
      }
    }
    
    if (videoError) {
      return { 
        text: 'VIDEO ERROR - TAP TO SKIP', 
        style: styles.errorButton, 
        disabled: false 
      };
    }
    
    if (!videoLoadedSuccessfully) {
      return { 
        text: 'TAP TO SKIP', 
        style: styles.loadingButton, 
        disabled: false 
      };
    }
    
    return { 
      text: `SKIP VIDEO`, 
      style: styles.skipButton, 
      disabled: false 
    };
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
          cacheEnabled={false}
          onMessage={handleWebViewMessage}
          onError={() => {
            setVideoError(true);
            skipToNextVideo();
          }}
          onHttpError={() => {
            setVideoError(true);
            skipToNextVideo();
          }}
        />
      </View>

      <View style={styles.controlsContainer}>
        <View style={styles.youtubeButtonContainer}>
          <ExternalLink size={20} color="#FF0000" />
          <TouchableOpacity onPress={handleOpenYouTube} style={styles.youtubeTextButton}>
            <Text style={styles.youtubeButtonText}>Open on YouTube</Text>
          </TouchableOpacity>
          <View style={styles.autoPlayContainer}>
            <Text style={styles.autoPlayText}>Auto Skip</Text>
            <TouchableOpacity 
              style={styles.toggle} 
              onPress={() => setAutoSkipEnabled(!autoSkipEnabled)}
            >
              <View style={[styles.toggleSlider, autoSkipEnabled && styles.toggleActive]} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, isProcessingReward && styles.statNumberProcessing]}>
              {isProcessingReward ? '⏳' : getRemainingTime()}
            </Text>
            <Text style={styles.statLabel}>
              {isProcessingReward ? 'Processing...' : 'Seconds to earn coins'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, isProcessingReward && styles.statNumberProcessing]}>
              {isProcessingReward ? '⏳' : (currentVideo?.coin_reward || '?')}
            </Text>
            <Text style={styles.statLabel}>
              {isProcessingReward ? 'Processing...' : 'Coins to earn'}
            </Text>
          </View>
        </View>

        {autoSkipEnabled && watchTimerRef.current >= (currentVideo?.duration_seconds || 0) && rewardProcessedRef.current && (
          <View style={styles.autoSkipIndicator}>
            <Text style={styles.autoSkipText}>
              🔄 Auto-skipping to next video...
            </Text>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.skipButtonBase, buttonState.style]}
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
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
  youtubeButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  youtubeTextButton: {
    flex: 1,
    marginLeft: 8,
  },
  youtubeButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  autoPlayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoPlayText: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
    fontWeight: '500',
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
    backgroundColor: '#00D4AA',
    alignSelf: 'flex-end',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  statNumberProcessing: {
    color: '#FF9500',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  autoSkipIndicator: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  autoSkipText: {
    color: '#1976D2',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  skipButtonBase: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  earnButton: {
    backgroundColor: '#00D4AA',
  },
  earnedButton: {
    backgroundColor: '#00BFA5',
  },
  processingButton: {
    backgroundColor: '#FF9500',
  },
  skipButton: {
    backgroundColor: '#FF6B6B',
  },
  loadingButton: {
    backgroundColor: '#9E9E9E',
  },
  errorButton: {
    backgroundColor: '#F44336',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
});