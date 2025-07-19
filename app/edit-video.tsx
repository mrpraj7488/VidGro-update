import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  Modal,
  FlatList,
  StatusBar,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoStore } from '@/store/videoStore';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Eye, Clock, Trash2, Play, Timer, ChevronDown, Check, MoveVertical as MoreVertical, CreditCard as Edit3 } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 480;
const isVerySmallScreen = screenWidth < 360;

interface VideoData {
  id: string;
  youtube_url: string;
  title: string;
  views_count: number;
  target_views: number;
  coin_reward: number;
  coin_cost: number;
  status: 'active' | 'paused' | 'completed' | 'on_hold' | 'repromoted';
  created_at: string;
  updated_at: string;
  hold_until?: string;
  duration_seconds: number;
  video_views?: any[];
  repromoted_at?: string;
}

const VIEW_OPTIONS = [10, 25, 50, 100, 200, 500];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

interface DropdownProps {
  visible: boolean;
  onClose: () => void;
  options: number[];
  selectedValue: number;
  onSelect: (value: number) => void;
  label: string;
  suffix: string;
}

const SmoothDropdown: React.FC<DropdownProps> = ({
  visible,
  onClose,
  options,
  selectedValue,
  onSelect,
  label,
  suffix,
}) => {
  const handleSelect = (value: number) => {
    onSelect(value);
    onClose();
  };

  const handleBackdropPress = () => {
    onClose();
  };

  const renderItem = ({ item }: { item: number }) => (
    <Pressable
      style={[
        styles.dropdownItem,
        item === selectedValue && styles.selectedDropdownItem
      ]}
      onPress={() => handleSelect(item)}
      android_ripple={{ color: '#E3F2FD' }}
    >
      <Text style={[
        styles.dropdownItemText,
        item === selectedValue && styles.selectedDropdownItemText
      ]}>
        {item} {suffix}
      </Text>
      {item === selectedValue && (
        <Check color="#3498DB" size={16} />
      )}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={handleBackdropPress}
      >
        <Pressable 
          style={styles.fullScreenModal}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable 
              onPress={onClose} 
              style={styles.closeButton}
              android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            renderItem={renderItem}
            keyExtractor={(item) => item.toString()}
            style={styles.modalList}
            showsVerticalScrollIndicator={false}
            bounces={true}
            contentContainerStyle={styles.modalListContent}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default function EditVideoScreen() {
  const { user, refreshProfile } = useAuth();
  const { clearQueue } = useVideoStore();
  const params = useLocalSearchParams();
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [holdTimer, setHoldTimer] = useState(0);
  const [showRepromoteOptions, setShowRepromoteOptions] = useState(false);
  const [selectedViews, setSelectedViews] = useState(50);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [repromoting, setRepromoting] = useState(false);

  // Animation values
  const coinBounce = useSharedValue(1);

  useEffect(() => {
    if (params.videoId && user) {
      fetchVideoData();
    } else if (params.videoData) {
      try {
        const video = JSON.parse(params.videoData as string);
        setVideoData(video);
        
        // Calculate hold timer if video is on hold
        if (video.status === 'on_hold') {
          let holdUntilTime: Date;
          
          if (video.hold_until) {
            // Use the exact hold_until timestamp from database
            holdUntilTime = new Date(video.hold_until);
          } else {
            // Fallback: calculate exactly 10 minutes from creation
            holdUntilTime = new Date(video.created_at);
            holdUntilTime.setMinutes(holdUntilTime.getMinutes() + 10);
          }
          
          const remainingMs = holdUntilTime.getTime() - new Date().getTime();
          setHoldTimer(Math.max(0, Math.floor(remainingMs / 1000)));
        }
        
        setLoading(false);
        setupRealTimeUpdates(video);
      } catch (error) {
        console.error('Error parsing video data:', error);
        router.back();
      }
    }
  }, [params.videoData, params.videoId, user]);

  const fetchVideoData = async () => {
    if (!params.videoId || !user) return;

    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', params.videoId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching video:', error);
        Alert.alert('Error', 'Failed to load video data');
        router.back();
        return;
      }

      setVideoData(data);
      
      // Calculate hold timer if video is on hold
      if (data.status === 'on_hold') {
        let holdUntilTime: Date;
        
        if (data.hold_until) {
          holdUntilTime = new Date(data.hold_until);
        } else {
          holdUntilTime = new Date(data.created_at);
          holdUntilTime.setMinutes(holdUntilTime.getMinutes() + 10);
        }
        
        const remainingMs = holdUntilTime.getTime() - new Date().getTime();
        setHoldTimer(Math.max(0, Math.floor(remainingMs / 1000)));
      }
      
      setupRealTimeUpdates(data);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const setupRealTimeUpdates = (video: VideoData) => {
    // Set up real-time updates for analytics
    const interval = setInterval(async () => {
      try {
        const { data: freshAnalytics, error: analyticsError } = await supabase
          .rpc('get_video_analytics_realtime_v2', {
            video_uuid: video.id,
            user_uuid: user?.id
          });
        
        if (!analyticsError && freshAnalytics && !freshAnalytics.error) {
          setVideoData(prev => prev ? {
            ...prev,
            views_count: freshAnalytics.views_count || prev.views_count,
            status: freshAnalytics.status || prev.status,
            display_views_count: freshAnalytics.display_views_count || freshAnalytics.views_count || prev.views_count,
            progress_text: freshAnalytics.progress_text || `${freshAnalytics.views_count || prev.views_count}/${prev.target_views}`
          } : null);
        } else {
          // Fallback: fetch fresh data directly from videos table
          const { data: videoUpdate } = await supabase
            .from('videos')
            .select('views_count, status')
            .eq('id', video.id)
            .single();
          
          if (videoUpdate) {
            setVideoData(prev => prev ? {
              ...prev,
              views_count: videoUpdate.views_count,
              status: videoUpdate.status,
              display_views_count: videoUpdate.views_count,
              progress_text: `${videoUpdate.views_count}/${prev.target_views}`
            } : null);
          }
        }
      } catch (error) {
        console.error('Error refreshing video analytics:', error);
      }
    }, 1000); // Update every 1 second for more responsive updates
    
    return () => clearInterval(interval);
  };

  // Update hold timer every second
  useEffect(() => {
    if (holdTimer > 0) {
      const interval = setInterval(() => {
        setHoldTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Handle timer completion
            setTimeout(() => {
              // Refresh the video data to get updated status
              if (videoData) {
                console.log('📊 Hold period completed for video:', videoData.youtube_url);
                // Refresh video data
                setVideoData(prev => prev ? { ...prev, status: 'active' } : null);
              }
            }, 100);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [holdTimer, videoData]);

  const getMinutesSinceCreation = () => {
    if (!videoData) return 0;
    const createdTime = new Date(videoData.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - createdTime.getTime()) / (1000 * 60));
  };

  const getRefundInfo = () => {
    const minutesSinceCreation = getMinutesSinceCreation();
    const isWithin10Minutes = minutesSinceCreation <= 10;
    const refundPercentage = isWithin10Minutes ? 100 : 80;
    const refundAmount = Math.floor((videoData?.coin_cost || 0) * refundPercentage / 100);
    
    return { refundPercentage, refundAmount, isWithin10Minutes };
  };

  const handleDeleteVideo = async () => {
    if (!videoData || !user) return;

    const { refundPercentage, refundAmount, isWithin10Minutes } = getRefundInfo();
    
    const message = `Deleting now refunds ${refundPercentage}% coins (🪙${refundAmount}). Confirm?`;

    Alert.alert(
      'Delete Video',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete the video
              const { error: deleteError } = await supabase
                .from('videos')
                .delete()
                .eq('id', videoData.id)
                .eq('user_id', user.id);

              if (deleteError) throw deleteError;

              // Process refund if there's an amount to refund
              if (refundAmount > 0) {
                const { error: refundError } = await supabase
                  .rpc('update_user_coins', {
                    user_uuid: user.id,
                    coin_amount: refundAmount,
                    transaction_type_param: 'admin_adjustment',
                    description_param: `Refund for deleted video: ${videoData.title} (${refundPercentage}%)`,
                    reference_uuid: videoData.id
                  });

                if (refundError) throw refundError;
              }

              // Refresh profile and clear queue
              await refreshProfile();
              clearQueue();

              // Animate coin update
              coinBounce.value = withSequence(
                withSpring(1.3, { damping: 15, stiffness: 150 }),
                withSpring(1, { damping: 15, stiffness: 150 })
              );

              Alert.alert('Success', `Video deleted and 🪙${refundAmount} coins refunded!`, [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error) {
              console.error('Error deleting video:', error);
              Alert.alert('Error', 'Failed to delete video. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Force analytics refresh when navigating back
  const handleNavigateBack = () => {
    // Clear any cached data
    clearQueue();
    router.back();
  };

  const calculateCoinCost = (views: number, duration: number) => {
    // Base cost calculation: views * duration factor
    const durationFactor = duration / 30; // 30 seconds as base
    return Math.ceil(views * durationFactor * 2); // 2 coins per view-duration unit
  };

  const handleRepromoteVideo = async () => {
    if (!videoData || !user || repromoting) return;

    // Check if video has completed its criteria before allowing repromote
    if (videoData.status === 'active' && videoData.views_count < videoData.target_views) {
      Alert.alert(
        'Cannot Repromote',
        'This video is still active and hasn\'t reached its target views yet. Please wait for it to complete or pause it first.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (videoData.status === 'on_hold') {
      Alert.alert(
        'Cannot Repromote',
        'This video is currently on hold. Please wait for the hold period to complete.',
        [{ text: 'OK' }]
      );
      return;
    }
    setRepromoting(true);
    
    try {
      const coinCost = calculateCoinCost(selectedViews, selectedDuration);
      
      // Check if user has enough coins
      const { data: profileData } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', user.id)
        .single();
      
      if ((profileData?.coins || 0) < coinCost) {
        Alert.alert('Insufficient Coins', `You need 🪙${coinCost} coins to repromote this video.`);
        setRepromoting(false);
        return;
      }

      // Deduct coins for repromotion
      const { error: coinError } = await supabase
        .rpc('update_user_coins', {
          user_uuid: user.id,
          coin_amount: -coinCost,
          transaction_type_param: 'video_promotion',
          description_param: `Repromoted video: ${videoData.title}`,
          reference_uuid: videoData.id
        });

      if (coinError) throw coinError;

      // Clear existing views for this video
      const { error: clearViewsError } = await supabase
        .from('video_views')
        .delete()
        .eq('video_id', videoData.id);

      if (clearViewsError) throw clearViewsError;

      // Update video with new promotion settings - set to repromoted status
      const { error: updateError } = await supabase
        .from('videos')
        .update({
          views_count: 0,
          target_views: selectedViews,
          duration_seconds: selectedDuration,
          coin_cost: coinCost,
          coin_reward: 3, // Fixed reward per view
          status: 'repromoted', // Set to repromoted status
          updated_at: new Date().toISOString(),
          hold_until: null, // Clear any hold period
          repromoted_at: new Date().toISOString()
        })
        .eq('id', videoData.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Refresh profile and clear queue
      await refreshProfile();
      clearQueue();

      Alert.alert(
        'Success',
        `Video repromoted successfully! It's now active in the queue with ${selectedViews} target views.`,
        [{ text: 'OK', onPress: handleNavigateBack }]
      );
    } catch (error) {
      console.error('Error repromoting video:', error);
      Alert.alert('Error', 'Failed to repromote video. Please try again.');
    } finally {
      setRepromoting(false);
    }
  };

  // Check if video can be repromoted
  const canRepromote = () => {
    if (!videoData) return false;
    
    // Allow repromote only for completed, paused, or repromoted videos
    return ['completed', 'paused', 'repromoted'].includes(videoData.status);
  };

  const formatHoldTimer = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#2ECC71';
      case 'completed': return '#3498DB';
      case 'paused': return '#E74C3C';
      case 'on_hold': return '#F39C12';
      case 'repromoted': return '#9B59B6';
      default: return '#95A5A6';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'ACTIVE';
      case 'completed': return 'COMPLETED';
      case 'paused': return 'PAUSED';
      case 'on_hold': return 'PENDING';
      case 'repromoted': return 'REPROMOTED';
      default: return status.toUpperCase();
    }
  };


  if (loading || !videoData) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading video details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#800080', '#FF4757']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={handleNavigateBack}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Video</Text>
          <Edit3 size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Video Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(videoData.status) }]}>
              <Text style={styles.statusText}>{getStatusText(videoData.status)}</Text>
            </View>
            <Text style={styles.videoId} numberOfLines={1}>ID: {videoData.title}</Text>
          </View>
        </View>

        {/* Pending Status Timeline */}
        {videoData.status === 'on_hold' && holdTimer > 0 && (
          <View style={styles.pendingCard}>
            <View style={styles.pendingHeader}>
              <Timer color="#F39C12" size={24} />
              <Text style={styles.pendingTitle}>Pending Status</Text>
            </View>
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatHoldTimer(holdTimer)} remaining</Text>
              <Text style={styles.timerSubtext}>Video will enter queue after hold period</Text>
            </View>
          </View>
        )}

        {/* Main Metrics */}
        <View style={styles.metricsSection}>
          <Text style={styles.sectionTitle}>Video Metrics</Text>
          
          <View style={styles.metricsGrid}>
            {/* Total Views */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Eye color="#3498DB" size={24} />
                <Text style={styles.metricLabel}>Total Views</Text>
              </View>
              <Text style={styles.metricValue}>
                {videoData.views_count}/{videoData.target_views}
              </Text>
            </View>

            {/* Watch Duration */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Clock color="#F39C12" size={24} />
                <Text style={styles.metricLabel}>Duration</Text>
              </View>
              <Text style={styles.metricValue}>
                {videoData.duration_seconds}s
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <Text style={styles.sectionTitle}>Actions</Text>

          {/* Delete Button */}
          <TouchableOpacity 
            style={[styles.actionButton, styles.deleteButton]} 
            onPress={handleDeleteVideo}
          >
            <Trash2 color="white" size={20} />
            <View style={styles.actionContent}>
              <Text style={styles.actionButtonText}>Delete Video</Text>
              <Text style={styles.actionSubtext}>
                Refund: 🪙{getRefundInfo().refundAmount} ({getRefundInfo().refundPercentage}%)
              </Text>
            </View>
          </TouchableOpacity>

          {/* Repromote Section */}
          <View style={styles.repromoteSection}>
            <Pressable 
              style={styles.repromoteToggle}
              onPress={() => setShowRepromoteOptions(!showRepromoteOptions)}
              android_ripple={{ color: '#F5F5F5' }}
            >
              <Text style={styles.repromoteLabel}>Repromote Video</Text>
              <ChevronDown 
                color="#333" 
                size={20} 
                style={[
                  styles.chevron,
                  showRepromoteOptions && styles.chevronRotated
                ]}
              />
            </Pressable>
            
            {showRepromoteOptions && (
              <View style={styles.repromoteOptions}>
                {!canRepromote() && (
                  <View style={styles.repromoteDisabledNotice}>
                    <Text style={styles.disabledNoticeText}>
                      Repromote is only available for completed, paused, or previously repromoted videos.
                    </Text>
                  </View>
                )}
                
                {/* Views Selection */}
                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Target Views</Text>
                  <Pressable 
                    style={[
                      styles.dropdown,
                      !canRepromote() && styles.dropdownDisabled
                    ]}
                    onPress={() => setShowViewsDropdown(true)}
                    disabled={!canRepromote()}
                    android_ripple={{ color: '#F0F0F0' }}
                  >
                    <Text style={[
                      styles.dropdownText,
                      !canRepromote() && styles.dropdownTextDisabled
                    ]}>
                      {selectedViews} views
                    </Text>
                    <ChevronDown 
                      color={canRepromote() ? "#666" : "#CCC"} 
                      size={16} 
                    />
                  </Pressable>
                </View>

                {/* Duration Selection */}
                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Watch Duration</Text>
                  <Pressable 
                    style={[
                      styles.dropdown,
                      !canRepromote() && styles.dropdownDisabled
                    ]}
                    onPress={() => setShowDurationDropdown(true)}
                    disabled={!canRepromote()}
                    android_ripple={{ color: '#F0F0F0' }}
                  >
                    <Text style={[
                      styles.dropdownText,
                      !canRepromote() && styles.dropdownTextDisabled
                    ]}>
                      {selectedDuration} seconds
                    </Text>
                    <ChevronDown 
                      color={canRepromote() ? "#666" : "#CCC"} 
                      size={16} 
                    />
                  </Pressable>
                </View>

                {/* Cost Display */}
                <View style={styles.costDisplay}>
                  <Text style={styles.costText}>
                    Cost: 🪙{calculateCoinCost(selectedViews, selectedDuration)}
                  </Text>
                </View>

                {/* Repromote Button */}
                <Pressable 
                  style={[
                    styles.actionButton, 
                    styles.repromoteButton,
                    (repromoting || !canRepromote()) && styles.buttonDisabled
                  ]} 
                  onPress={handleRepromoteVideo}
                  disabled={repromoting || !canRepromote()}
                  android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  <Play color="white" size={20} />
                  <View style={styles.actionContent}>
                    <Text style={styles.actionButtonText}>
                      {repromoting ? 'Repromoting...' : 'Repromote Now'}
                    </Text>
                    <Text style={styles.actionSubtext}>
                      {canRepromote() ? 'Instantly active in queue' : 'Not available for this video'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Dropdowns */}
      <SmoothDropdown
        visible={showViewsDropdown}
        onClose={() => setShowViewsDropdown(false)}
        options={VIEW_OPTIONS}
        selectedValue={selectedViews}
        onSelect={setSelectedViews}
        label="Select Target Views"
        suffix="views"
      />

      <SmoothDropdown
        visible={showDurationDropdown}
        onClose={() => setShowDurationDropdown(false)}
        options={DURATION_OPTIONS}
        selectedValue={selectedDuration}
        onSelect={setSelectedDuration}
        label="Select Duration (seconds)"
        suffix="seconds"
      />
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
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  scrollView: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  videoId: {
    fontSize: 12,
    color: '#666',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  pendingCard: {
    backgroundColor: '#FFF8E1',
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F39C12',
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F57C00',
    marginLeft: 8,
  },
  timerContainer: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F39C12',
    fontFamily: 'monospace',
  },
  timerSubtext: {
    fontSize: 12,
    color: '#F57C00',
    marginTop: 4,
  },
  metricsSection: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: isSmallScreen ? 16 : 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  metricValue: {
    fontSize: isSmallScreen ? 16 : 18,
    fontWeight: 'bold',
    color: '#333',
  },
  actionSection: {
    margin: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: '#E74C3C',
  },
  repromoteButton: {
    backgroundColor: '#800080',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionContent: {
    marginLeft: 12,
    flex: 1,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  actionSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
  repromoteSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  repromoteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  repromoteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  repromoteOptions: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  optionGroup: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownText: {
    fontSize: 14,
    color: '#333',
  },
  costDisplay: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  costText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3498DB',
  },
  // Modal styles for smooth dropdown
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isVerySmallScreen ? 10 : 20,
  },
  fullScreenModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    maxHeight: isSmallScreen ? '80%' : '70%',
    minHeight: isSmallScreen ? '50%' : '40%',
    width: '100%',
    maxWidth: isVerySmallScreen ? screenWidth - 20 : 400,
    ...Platform.select({
      android: {
        elevation: 10,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      web: {
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FF4757',
    paddingHorizontal: isVerySmallScreen ? 15 : 20,
    paddingVertical: isVerySmallScreen ? 12 : 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: isVerySmallScreen ? 16 : 18,
    fontWeight: '600',
    color: 'white',
    flex: 1,
    marginRight: 10,
  },
  closeButton: {
    padding: isVerySmallScreen ? 6 : 8,
    borderRadius: 20,
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: isVerySmallScreen ? 18 : 20,
    color: 'white',
    fontWeight: 'bold',
  },
  modalList: {
    flex: 1,
    backgroundColor: 'white',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  modalListContent: {
    paddingBottom: 20,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isVerySmallScreen ? 15 : 20,
    paddingVertical: isVerySmallScreen ? 12 : 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: isVerySmallScreen ? 48 : 56,
  },
  selectedDropdownItem: {
    backgroundColor: '#F0F8FF',
  },
  dropdownItemText: {
    fontSize: isVerySmallScreen ? 14 : 16,
    color: '#333',
    flex: 1,
  },
  selectedDropdownItemText: {
    color: '#3498DB',
    fontWeight: '600',
  },
  repromoteDisabledNotice: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  disabledNoticeText: {
    fontSize: isVerySmallScreen ? 12 : 13,
    color: '#856404',
    lineHeight: 18,
  },
  dropdownDisabled: {
    backgroundColor: '#F8F9FA',
    opacity: 0.6,
  },
  dropdownTextDisabled: {
    color: '#999',
  },
  disabledText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  chevronDisabled: {
    opacity: 0.5,
  },
});