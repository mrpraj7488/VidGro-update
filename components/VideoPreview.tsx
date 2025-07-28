import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Play, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Clock, RefreshCw } from 'lucide-react-native';

interface VideoData {
  id: string;
  embedUrl: string;
  thumbnail: string;
  title?: string;
  embeddable: boolean;
  originalUrl: string;
  autoDetectedTitle?: string;
  isLive?: boolean;
}

interface VideoPreviewProps {
  youtubeUrl: string;
  onValidation: (isValid: boolean, title?: string, videoId?: string) => void;
  onTitleDetected: (title: string) => void;
  collapsed?: boolean;
}

const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

const fetchVideoData = async (
  youtubeUrl: string,
  setTitle: (title: string) => void,
  setVideoData: (data: VideoData | null) => void,
  setError: (error: string | null) => void,
  setShowIframe: (show: boolean) => void,
  setEmbedabilityTested: (tested: boolean) => void,
  setRetryCount: (count: number) => void,
  setLoadingTimeout: (timeout: boolean) => void,
  showToast: (message: string) => void,
  title: string
) => {
  if (!youtubeUrl.trim()) {
    setError('Please enter a YouTube URL');
    return;
  }

  setError(null);
  setVideoData(null);
  setShowIframe(false);
  setEmbedabilityTested(false);
  setRetryCount(0);
  setLoadingTimeout(false);

  try {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL format');
    }

    try {
      const oEmbedResponse = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oEmbedResponse.ok) {
        const oEmbedData = await oEmbedResponse.json();
        if (oEmbedData.title && !title) {
          setTitle(oEmbedData.title);
          showToast(`Title auto-filled: ${oEmbedData.title}`);
        }
      }
    } catch (oEmbedError) {
      console.log('Could not fetch title via oEmbed, user can enter manually');
    }

    const processedVideoData: VideoData = {
      id: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      embeddable: false,
      originalUrl: youtubeUrl,
    };

    setVideoData(processedVideoData);
    setShowIframe(true);
    showToast('Video processing... Testing compatibility...');
  } catch (error: any) {
    console.error('Error extracting video data:', error);
    setError(error.message || 'Failed to extract video ID. Please check the URL format.');
    setVideoData(null);
  }
};

const createIframeHTML = (embedUrl: string, videoData: VideoData | null, retryCount: number, maxRetries: number, loadingTimeoutDuration: number) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        #player {
          width: 100%;
          height: 100%;
          border: none;
        }
        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-family: Arial, sans-serif;
          z-index: 1000;
          text-align: center;
        }
        .error {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #ff4757;
          font-family: Arial, sans-serif;
          text-align: center;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div id="loading" class="loading">Testing video compatibility...</div>
      <div id="error" class="error" style="display: none;"></div>
      <div id="player"></div>
      
      <script>
        console.log('Initializing YouTube iframe validation for video ID: ${videoData?.id}');
        
        var player;
        var isPlayerReady = false;
        var loadingTimeoutId;
        var retryAttempt = ${retryCount};
        var maxRetries = ${maxRetries};
        var hasTimedOut = false;
        var isLiveVideo = false;
        var hasError = false;
        var initializationInProgress = false;
        
        loadingTimeoutId = setTimeout(function() {
          if (!isPlayerReady && !hasTimedOut) {
            hasTimedOut = true;
            console.log('Loading timeout reached');
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = 'Video loading timeout. May not be embeddable.';
            
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'LOADING_TIMEOUT',
              message: 'Loading timeout after ${loadingTimeoutDuration}ms'
            }));
          }
        }, ${loadingTimeoutDuration});

        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = function() {
          console.error('Failed to load YouTube IFrame API');
          clearTimeout(loadingTimeoutId);
          hasError = true;
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          document.getElementById('error').textContent = 'Failed to load YouTube API';
          
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'API_LOAD_ERROR',
            message: 'Failed to load YouTube IFrame API'
          }));
        };
        
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        function onYouTubeIframeAPIReady() {
          if (initializationInProgress || hasError || hasTimedOut) {
            return;
          }
          
          initializationInProgress = true;
          console.log('YouTube IFrame API ready');
          
          try {
            player = new YT.Player('player', {
              height: '100%',
              width: '100%',
              videoId: '${videoData?.id}',
              playerVars: {
                'autoplay': 0,
                'controls': 0,
                'modestbranding': 1,
                'showinfo': 0,
                'rel': 0,
                'fs': 0,
                'disablekb': 1,
                'iv_load_policy': 3,
                'enablejsapi': 1,
                'origin': window.location.origin
              },
              events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
              }
            });
          } catch (error) {
            console.error('Error creating YouTube player:', error);
            hasError = true;
            clearTimeout(loadingTimeoutId);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = 'Failed to initialize player';
            
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAYER_INIT_ERROR',
              message: 'Failed to initialize YouTube player'
            }));
          }
        }

        function onPlayerReady(event) {
          if (hasError || hasTimedOut) {
            return;
          }
          
          console.log('Player ready');
          clearTimeout(loadingTimeoutId);
          isPlayerReady = true;
          document.getElementById('loading').style.display = 'none';
          
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PLAYER_READY',
            videoId: '${videoData?.id}'
          }));
          
          setTimeout(function() {
            if (player && player.playVideo && isPlayerReady && !hasError) {
              try {
                console.log('Starting auto-playback test');
                player.playVideo();
              } catch (error) {
                console.error('Error starting playback:', error);
              }
            }
          }, 1500);
        }

        function onPlayerStateChange(event) {
          if (hasError || hasTimedOut) {
            return;
          }
          
          var state = event.data;
          var stateNames = {
            '-1': 'UNSTARTED',
            '0': 'ENDED',
            '1': 'PLAYING',
            '2': 'PAUSED',
            '3': 'BUFFERING',
            '5': 'CUED'
          };
          
          console.log('Player state changed to:', stateNames[state] || state);
          
          if (state === 3) {
            setTimeout(function() {
              if (player && player.getPlayerState && player.getPlayerState() === 3) {
                try {
                  var videoData = player.getVideoData();
                  if (videoData && videoData.isLive) {
                    isLiveVideo = true;
                    console.log('Live video detected');
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'LIVE_VIDEO_DETECTED',
                      message: 'Live videos are not supported'
                    }));
                    return;
                  }
                } catch (error) {
                  console.log('Could not check live status:', error);
                }
              }
            }, 3000);
          }
          
          if (state === 1) {
            console.log('Video is playing - embeddable confirmed');
            
            setTimeout(function() {
              detectTitle();
            }, 2000);
            
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAYBACK_SUCCESS',
              embeddable: true,
              state: state,
              stateName: stateNames[state]
            }));
          } else if (state === 2) {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'STATE_CHANGE',
              state: state,
              stateName: stateNames[state]
            }));
          }
        }

        function onPlayerError(event) {
          console.error('Player error:', event.data);
          clearTimeout(loadingTimeoutId);
          hasError = true;
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          
          var errorMessages = {
            2: 'Invalid video ID',
            5: 'HTML5 player error',
            100: 'Video not found or private',
            101: 'Video not allowed to be played in embedded players',
            150: 'Video not allowed to be played in embedded players'
          };
          
          var errorMessage = errorMessages[event.data] || 'Video playback error';
          document.getElementById('error').textContent = errorMessage;
          
          if ((event.data === 5 || !event.data) && retryAttempt < maxRetries) {
            console.log('Retrying due to error:', errorMessage);
            setTimeout(function() {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'RETRY_NEEDED',
                error: event.data,
                message: errorMessage,
                retryAttempt: retryAttempt + 1
              }));
            }, 2000);
          } else {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAYBACK_FAILED',
              embeddable: false,
              error: event.data,
              message: errorMessage,
              isEmbeddingError: event.data === 101 || event.data === 150
            }));
          }
        }
        
        function detectTitle() {
          try {
            var detectedTitle = '';
            
            if (document.title && document.title !== 'YouTube') {
              detectedTitle = document.title.replace(' - YouTube', '');
            }
            
            if (player && player.getVideoData) {
              try {
                var videoData = player.getVideoData();
                if (videoData && videoData.title) {
                  detectedTitle = videoData.title;
                }
              } catch (e) {
                console.log('Could not get video data:', e);
              }
            }
            
            if (!detectedTitle) {
              detectedTitle = 'Video ${videoData?.id || 'Unknown'}';
            }
            
            console.log('Title detected:', detectedTitle);
            
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'TITLE_DETECTED',
              title: detectedTitle,
              success: true
            }));
            
          } catch (error) {
            console.error('Title detection failed:', error);
            var fallbackTitle = 'Video ${videoData?.id || 'Unknown'}';
            
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'TITLE_DETECTED',
              title: fallbackTitle,
              success: false,
              message: 'Used fallback title'
            }));
          }
        }
        
        window.onerror = function(msg, url, lineNo, columnNo, error) {
          console.error('Page error:', msg);
          hasError = true;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAGE_ERROR',
            message: 'Page error: ' + msg
          }));
          return true;
        };
      </script>
    </body>
    </html>
  `;
};

const handleWebViewMessage = (
  event: any,
  setIframeLoaded: (loaded: boolean) => void,
  setLoadingTimeout: (timeout: boolean) => void,
  setError: (error: string | null) => void,
  setVideoData: (data: VideoData | null) => void,
  setEmbedabilityTested: (tested: boolean) => void,
  setRetryCount: (count: number) => void,
  setShowIframe: (show: boolean) => void,
  setTitle: (title: string) => void,
  setIsPlaying: (playing: boolean) => void,
  showToast: (message: string) => void,
  maxRetries: number,
  title: string
) => {
  try {
    const data = JSON.parse(event.nativeEvent.data);
    console.log('WebView message:', data);
    
    switch (data.type) {
      case 'PLAYER_READY':
        setIframeLoaded(true);
        setLoadingTimeout(false);
        showToast('Video player loaded successfully');
        break;
        
      case 'LOADING_TIMEOUT':
        setLoadingTimeout(true);
        setIframeLoaded(false);
        setError('Video loading timeout. It may not be embeddable.');
        break;
        
      case 'API_LOAD_ERROR':
      case 'PLAYER_INIT_ERROR':
        setError('Failed to load YouTube API. Please check your internet connection.');
        break;
        
      case 'LIVE_VIDEO_DETECTED':
        setError('Live videos cannot be promoted. Please choose a regular video.');
        setVideoData(prev => prev ? { ...prev, embeddable: false, isLive: true } : null);
        setEmbedabilityTested(true);
        break;
        
      case 'PLAYBACK_SUCCESS':
        setEmbedabilityTested(true);
        setVideoData(prev => prev ? { ...prev, embeddable: true } : null);
        setError(null);
        showToast('✅ Video is embeddable and ready for promotion!');
        break;
        
      case 'PLAYBACK_FAILED':
        setEmbedabilityTested(true);
        setVideoData(prev => prev ? { ...prev, embeddable: false } : null);
        
        if (data.isEmbeddingError) {
          setError('This video cannot be embedded. Please make it embeddable first or choose a different video.');
        } else {
          setError(data.message || 'Video playback failed. Please try a different video.');
        }
        break;
        
      case 'RETRY_NEEDED':
        if (data.retryAttempt <= maxRetries) {
          console.log(`Retrying video load (attempt ${data.retryAttempt})`);
          showToast(`Retrying... (${data.retryAttempt}/${maxRetries})`);
          setRetryCount(data.retryAttempt);
          
          setTimeout(() => {
            setShowIframe(false);
            setTimeout(() => {
              setShowIframe(true);
            }, 100);
          }, 2000);
        } else {
          showToast('Video unavailable after retries');
          setError('Video failed to load after multiple attempts.');
          setEmbedabilityTested(true);
        }
        break;
        
      case 'TITLE_DETECTED':
        if (data.title) {
          setVideoData(prev => prev ? { ...prev, autoDetectedTitle: data.title } : null);
          if (!title) {
            setTitle(data.title);
          }
          showToast(`Title detected: ${data.title}`);
        }
        break;
        
      case 'STATE_CHANGE':
        if (data.state === 1) {
          setIsPlaying(true);
        } else if (data.state === 2) {
          setIsPlaying(false);
        }
        break;
        
      case 'PAGE_ERROR':
        console.log('Page error in iframe:', data.message);
        setError('Page error occurred in video player.');
        break;
    }
  } catch (error) {
    console.error('Error parsing WebView message:', error);
  }
};

export default function VideoPreview({ youtubeUrl, onValidation, onTitleDetected, collapsed = false }: VideoPreviewProps) {
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [embedabilityTested, setEmbedabilityTested] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState('');

  const maxRetries = 3;
  const loadingTimeoutDuration = 8000;

  const showToast = (message: string) => {
    console.log('Toast:', message);
  };

  useEffect(() => {
    if (youtubeUrl) {
      fetchVideoData(
        youtubeUrl,
        setTitle,
        setVideoData,
        setError,
        setShowIframe,
        setEmbedabilityTested,
        setRetryCount,
        setLoadingTimeout,
        showToast,
        title
      );
    }
  }, [youtubeUrl]);

  useEffect(() => {
    if (videoData) {
      onValidation(videoData.embeddable, videoData.autoDetectedTitle, videoData.id);
    }
  }, [videoData, onValidation]);

  useEffect(() => {
    if (title) {
      onTitleDetected(title);
    }
  }, [title, onTitleDetected]);

  const handleWebViewMessageWrapper = (event: any) => {
    handleWebViewMessage(
      event,
      setIframeLoaded,
      setLoadingTimeout,
      setError,
      setVideoData,
      setEmbedabilityTested,
      setRetryCount,
      setShowIframe,
      setTitle,
      setIsPlaying,
      showToast,
      maxRetries,
      title
    );
  };

  if (!youtubeUrl) {
    return null;
  }

  if (collapsed && videoData) {
    return (
      <View style={styles.collapsedContainer}>
        <Image source={{ uri: videoData.thumbnail }} style={styles.collapsedThumbnail} />
        <View style={styles.collapsedInfo}>
          <Text style={styles.collapsedTitle} numberOfLines={2}>
            {videoData.autoDetectedTitle || title || 'Video Preview'}
          </Text>
          <View style={styles.statusContainer}>
            {embedabilityTested ? (
              videoData.embeddable ? (
                <View style={styles.statusBadge}>
                  <CheckCircle size={12} color="#2ECC71" />
                  <Text style={[styles.statusText, { color: '#2ECC71' }]}>Ready</Text>
                </View>
              ) : (
                <View style={styles.statusBadge}>
                  <AlertCircle size={12} color="#E74C3C" />
                  <Text style={[styles.statusText, { color: '#E74C3C' }]}>Not Embeddable</Text>
                </View>
              )
            ) : (
              <View style={styles.statusBadge}>
                <Clock size={12} color="#F39C12" />
                <Text style={[styles.statusText, { color: '#F39C12' }]}>Testing...</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <AlertCircle size={20} color="#E74C3C" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {videoData && (
        <View style={styles.previewContainer}>
          <View style={styles.thumbnailContainer}>
            <Image source={{ uri: videoData.thumbnail }} style={styles.thumbnail} />
            {showIframe && (
              <View style={styles.webViewContainer}>
                <WebView
                  source={{ html: createIframeHTML(videoData.embedUrl, videoData, retryCount, maxRetries, loadingTimeoutDuration) }}
                  style={styles.webView}
                  onMessage={handleWebViewMessageWrapper}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  allowsInlineMediaPlayback={true}
                  mediaPlaybackRequiresUserAction={false}
                  scrollEnabled={false}
                  bounces={false}
                />
              </View>
            )}
            
            {!iframeLoaded && showIframe && (
              <View style={styles.loadingOverlay}>
                <RefreshCw size={24} color="white" />
                <Text style={styles.loadingText}>Testing compatibility...</Text>
              </View>
            )}
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.videoTitle} numberOfLines={2}>
              {videoData.autoDetectedTitle || title || 'Loading title...'}
            </Text>
            
            <View style={styles.statusRow}>
              {embedabilityTested ? (
                videoData.embeddable ? (
                  <View style={[styles.statusBadge, { backgroundColor: '#E8F5E8' }]}>
                    <CheckCircle size={16} color="#2ECC71" />
                    <Text style={[styles.statusText, { color: '#2ECC71' }]}>Ready for promotion</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: '#FFEBEE' }]}>
                    <AlertCircle size={16} color="#E74C3C" />
                    <Text style={[styles.statusText, { color: '#E74C3C' }]}>Not embeddable</Text>
                  </View>
                )
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: '#FFF8E1' }]}>
                  <Clock size={16} color="#F39C12" />
                  <Text style={[styles.statusText, { color: '#F39C12' }]}>Testing...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: '#E74C3C',
    fontSize: 14,
    lineHeight: 20,
  },
  previewContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnailContainer: {
    position: 'relative',
    height: 200,
    backgroundColor: '#000',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  webViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  infoContainer: {
    padding: 16,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  collapsedContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  collapsedThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#000',
  },
  collapsedInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  collapsedTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    lineHeight: 18,
  },
  statusContainer: {
    marginTop: 4,
  },
});