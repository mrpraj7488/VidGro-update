import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { validateVideoForPromotion, getThumbnailUrl, extractVideoId, generateDefaultTitle } from '../utils/youtube';
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle, Play } from 'lucide-react-native';

interface VideoPreviewProps {
  youtubeUrl: string;
  onValidation: (isValid: boolean, title?: string, videoId?: string) => void;
  collapsed?: boolean;
}

export default function VideoPreview({ youtubeUrl, onValidation, collapsed = false }: VideoPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (youtubeUrl) {
      validateVideo();
    } else {
      resetState();
    }
  }, [youtubeUrl]);

  const resetState = () => {
    setVideoInfo(null);
    setError(null);
    setLoading(false);
    setShowPreview(false);
    onValidation(false);
  };

  const validateVideo = async () => {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      resetState();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await validateVideoForPromotion(trimmedUrl);
      
      if (result.isValid && result.videoInfo) {
        setVideoInfo(result.videoInfo);
        setShowPreview(true);
        // Extract actual title from YouTube URL or use generated title
        const actualTitle = result.videoInfo.title || generateTitleFromUrl(trimmedUrl);
        onValidation(true, actualTitle, result.videoInfo.id);
      } else {
        setError(result.error || 'Video validation failed');
        onValidation(false);
      }
    } catch (err) {
      setError('Invalid video URL format');
      onValidation(false);
    } finally {
      setLoading(false);
    }
  };

  const generateTitleFromUrl = (url: string): string => {
    const videoId = extractVideoId(url);
    if (videoId) {
      return `Video ${videoId.substring(0, 8)}`;
    }
    return 'Untitled Video';
  };

  if (!youtubeUrl) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#800080" />
          <Text style={styles.loadingText}>Checking video...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#E74C3C" />
          <Text style={styles.errorTitle}>Video Not Available</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!videoInfo) {
    return null;
  }

  if (collapsed) {
    return (
      <View style={styles.collapsedContainer}>
        <View style={styles.collapsedContent}>
          <Image
            source={{ uri: videoInfo.thumbnail }}
            style={styles.collapsedThumbnail}
            resizeMode="cover"
          />
          <View style={styles.collapsedInfo}>
            <Text style={styles.collapsedTitle} numberOfLines={2}>
              {videoInfo.title}
            </Text>
            <View style={styles.validationBadge}>
              <CheckCircle size={16} color="#2ECC71" />
              <Text style={styles.validationText}>Video is valid</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>Video Preview</Text>
        <View style={styles.validationBadge}>
          <CheckCircle size={16} color="#2ECC71" />
          <Text style={styles.validationText}>Valid</Text>
        </View>
      </View>

      <View style={styles.videoContainer}>
        <WebView
          source={{ uri: videoInfo.embedUrl }}
          style={styles.webView}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onError={() => {
            setError('Video failed to load.');
            onValidation(false);
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
        />
        {loading && (
          <View style={styles.webViewLoading}>
            <ActivityIndicator size="large" color="white" />
          </View>
        )}
      </View>

      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {videoInfo.title}
        </Text>
        <Text style={styles.videoId}>Video ID: {videoInfo.id}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E74C3C',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  validationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  validationText: {
    fontSize: 12,
    color: '#2ECC71',
    fontWeight: '600',
  },
  videoContainer: {
    height: 200,
    backgroundColor: '#000',
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  videoInfo: {
    padding: 16,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  videoId: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
  collapsedContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  collapsedContent: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  collapsedThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
  },
  collapsedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  collapsedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    lineHeight: 18,
    marginBottom: 6,
  },
});