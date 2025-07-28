import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { validateYouTubeUrl, validateVideoTitle, extractYouTubeVideoId } from '../../utils/validation';
import VideoPreview from '@/components/VideoPreview';
import GlobalHeader from '@/components/GlobalHeader';
import { Play, Eye, Clock, Crown } from 'lucide-react-native';

export default function PromoteTab() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [targetViews, setTargetViews] = useState(50);
  const [videoDuration, setVideoDuration] = useState(30);
  const [isValidVideo, setIsValidVideo] = useState(false);
  const [videoId, setVideoId] = useState('');
  const [loading, setLoading] = useState(false);

  // Fixed reward calculation logic based on duration
  const calculateCoinsByDuration = (durationSeconds: number): number => {
    if (durationSeconds >= 540) return 200;
    if (durationSeconds >= 480) return 150;
    if (durationSeconds >= 420) return 130;
    if (durationSeconds >= 360) return 100;
    if (durationSeconds >= 300) return 90;
    if (durationSeconds >= 240) return 70;
    if (durationSeconds >= 180) return 55;
    if (durationSeconds >= 150) return 50;
    if (durationSeconds >= 120) return 45;
    if (durationSeconds >= 90) return 35;
    if (durationSeconds >= 60) return 25;
    if (durationSeconds >= 45) return 15;
    if (durationSeconds >= 30) return 10;
    return 5;
  };

  // Improved cost calculation with higher charges
  const calculateCost = () => {
    // Higher cost calculation: base cost increased significantly
    const baseCost = Math.ceil((targetViews * videoDuration) / 50 * 8); // Doubled the multiplier and halved the divisor
    return profile?.is_vip ? Math.ceil(baseCost * 0.9) : baseCost;
  };

  const getVipDiscount = () => {
    if (!profile?.is_vip) return 0;
    const baseCost = Math.ceil((targetViews * videoDuration) / 50 * 8);
    return Math.ceil(baseCost * 0.1);
  };

  const handleVideoValidation = (isValid: boolean, title?: string, extractedVideoId?: string) => {
    setIsValidVideo(isValid);
    if (title) {
      setVideoTitle(title);
    }
    if (extractedVideoId) {
      setVideoId(extractedVideoId);
    }
  };

  const handleTitleDetected = (detectedTitle: string) => {
    setVideoTitle(detectedTitle);
  };

  const handlePromoteVideo = async () => {
    if (!user || !profile) {
      Alert.alert('Error', 'Please log in to promote videos');
      return;
    }

    const urlValidation = validateYouTubeUrl(youtubeUrl);
    if (!urlValidation.isValid) {
      Alert.alert('Invalid URL', urlValidation.error || 'Please enter a valid YouTube URL');
      return;
    }

    const titleValidation = validateVideoTitle(videoTitle);
    if (!titleValidation.isValid) {
      Alert.alert('Invalid Title', titleValidation.error || 'Please enter a valid video title');
      return;
    }

    if (!isValidVideo) {
      Alert.alert('Video Not Ready', 'Please wait for video validation to complete');
      return;
    }

    const extractedVideoId = extractYouTubeVideoId(youtubeUrl);
    if (!extractedVideoId) {
      Alert.alert('Invalid URL', 'Could not extract video ID from URL');
      return;
    }

    const cost = calculateCost();
    if (profile.coins < cost) {
      Alert.alert(
        'Insufficient Coins',
        `You need ${cost} coins to promote this video. You currently have ${profile.coins} coins.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Coins', onPress: () => router.push('/buy-coins') }
        ]
      );
      return;
    }

    setLoading(true);

    try {
      // Calculate dynamic coin reward based on duration
      const coinReward = calculateCoinsByDuration(videoDuration);
      
      const { data: result, error } = await supabase.rpc('create_video_simple', {
        coin_cost_param: cost,
        coin_reward_param: coinReward,
        duration_seconds_param: videoDuration,
        target_views_param: targetViews,
        title_param: videoTitle,
        user_uuid: user.id,
        youtube_url_param: extractedVideoId
      });

      if (!error && result) {
        await refreshProfile();
        const vipDiscount = getVipDiscount();
        const discountText = vipDiscount > 0 ? `\n\n👑 VIP Discount Applied: ${vipDiscount} coins saved!` : '';
        
        Alert.alert(
          'Video Promoted Successfully!',
          `Your video "${videoTitle}" has been submitted for promotion with ${coinReward} coin reward per view. It will be active in the queue after a 10-minute hold period.${discountText}`,
          [
            { text: 'OK', onPress: () => {
              setYoutubeUrl('');
              setVideoTitle('');
              setIsValidVideo(false);
              router.push('/(tabs)/analytics');
            }}
          ]
        );
      } else {
        Alert.alert('Error', error?.message || 'Failed to promote video. Please try again.');
      }
    } catch (error) {
      console.error('Error promoting video:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const targetViewsOptions = [35, 50, 100, 200, 300, 400, 500, 750, 1000];
  const durationOptions = [30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 540];

  const cost = calculateCost();
  const vipDiscount = getVipDiscount();

  return (
    <View style={styles.container}>
      <GlobalHeader 
        title="Promote" 
        showCoinDisplay={true}
        menuVisible={menuVisible} 
        setMenuVisible={setMenuVisible} 
      />
      
      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>YouTube Video URL</Text>
            <TextInput
              style={styles.textInput}
              placeholder="https://www.youtube.com/watch?v=..."
              placeholderTextColor="#999"
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {youtubeUrl && (
            <VideoPreview
              youtubeUrl={youtubeUrl}
              onValidation={handleVideoValidation}
              onTitleDetected={handleTitleDetected}
              collapsed={false}
            />
          )}

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Video Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter video title"
              placeholderTextColor="#999"
              value={videoTitle}
              onChangeText={setVideoTitle}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Target Views</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionsScroll}>
              {targetViewsOptions.map((views) => (
                <TouchableOpacity
                  key={views}
                  style={[
                    styles.optionButton,
                    targetViews === views && styles.selectedOption
                  ]}
                  onPress={() => setTargetViews(views)}
                >
                  <Eye size={16} color={targetViews === views ? 'white' : '#800080'} />
                  <Text style={[
                    styles.optionText,
                    targetViews === views && styles.selectedOptionText
                  ]}>
                    {views}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Video Duration (seconds)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionsScroll}>
              {durationOptions.map((duration) => (
                <TouchableOpacity
                  key={duration}
                  style={[
                    styles.optionButton,
                    videoDuration === duration && styles.selectedOption
                  ]}
                  onPress={() => setVideoDuration(duration)}
                >
                  <Clock size={16} color={videoDuration === duration ? 'white' : '#800080'} />
                  <Text style={[
                    styles.optionText,
                    videoDuration === duration && styles.selectedOptionText
                  ]}>
                    {duration}s
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.costSection}>
            <Text style={styles.costTitle}>Promotion Summary</Text>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Target Views:</Text>
              <Text style={styles.costValue}>{targetViews}</Text>
            </View>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Duration:</Text>
              <Text style={styles.costValue}>{videoDuration}s</Text>
            </View>
            {vipDiscount > 0 && (
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>Base Cost:</Text>
                <Text style={styles.costValue}>🪙{Math.ceil((targetViews * videoDuration) / 50 * 8)}</Text>
              </View>
            )}
            {vipDiscount > 0 && (
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>👑 VIP Discount (10%):</Text>
                <Text style={styles.vipDiscountValue}>-🪙{vipDiscount}</Text>
              </View>
            )}
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Final Cost:</Text>
              <Text style={styles.costValue}>🪙{cost}</Text>
            </View>
            {profile?.is_vip && (
              <View style={styles.vipDiscount}>
                <Text style={styles.vipDiscountText}>👑 VIP 10% Discount Applied</Text>
              </View>
            )}
            {!profile?.is_vip && (
              <TouchableOpacity 
                style={styles.vipUpgrade}
                onPress={() => router.push('/become-vip')}
              >
                <Crown size={16} color="#FFD700" />
                <Text style={styles.vipUpgradeText}>
                  Upgrade to VIP and save 🪙{Math.ceil((targetViews * videoDuration) / 50 * 8 * 0.1)} on this promotion
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.promoteButton,
              (!isValidVideo || loading) && styles.promoteButtonDisabled
            ]}
            onPress={handlePromoteVideo}
            disabled={!isValidVideo || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Play size={20} color="white" />
            )}
            <Text style={styles.promoteButtonText}>
              {loading ? 'Promoting...' : 'Promote Video'}
            </Text>
          </TouchableOpacity>

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              1. Enter your YouTube video URL{'\n'}
              2. Set your target views and duration{'\n'}
              3. Pay with coins to promote your video (reward varies by duration){'\n'}
              4. Your video enters a 10-minute hold period{'\n'}
              5. After hold, your video goes live in the queue{'\n'}
              6. Users watch and earn coins based on video duration!
              {'\n'}7. 👑 VIP members get 10% discount on all promotions
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionsScroll: {
    marginTop: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    gap: 6,
  },
  selectedOption: {
    backgroundColor: '#800080',
    borderColor: '#800080',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#800080',
  },
  selectedOptionText: {
    color: 'white',
  },
  costSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  costTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  costLabel: {
    fontSize: 16,
    color: '#666',
  },
  costValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  vipDiscountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2ECC71',
  },
  vipDiscount: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  vipDiscountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F57C00',
  },
  vipUpgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  vipUpgradeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F57C00',
    flex: 1,
  },
  promoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#800080',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  promoteButtonDisabled: {
    opacity: 0.6,
  },
  promoteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});