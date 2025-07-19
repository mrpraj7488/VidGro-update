import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoStore } from '../../store/videoStore';
import { supabase } from '../../lib/supabase';
import { 
  Video, 
  ChevronDown, 
  ChevronUp, 
  CreditCard as Edit3, 
  Eye, 
  Timer, 
  Activity, 
  DollarSign, 
  Play,
  Coins,
  RefreshCw
} from 'lucide-react-native';
import GlobalHeader from '../../components/GlobalHeader';
import { useFocusEffect } from '@react-navigation/native';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 480;

interface AnalyticsData {
  totalVideosPromoted: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  totalViewsReceived: number;
  totalWatchTime: number;
  activeVideos: number;
  completedVideos: number;
  onHoldVideos: number;
  recentActivities: Transaction[];
  promotedVideos: PromotedVideo[];
}

interface PromotedVideo {
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
  total_watch_time: number;
  engagement_rate: number;
  completion_rate: number;
  average_watch_time: number;
  repromoted_at?: string;
  video_views?: any[];
  display_views_count?: number;
  progress_text?: string;
  fresh_data?: boolean;
}

interface Transaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
  reference_id?: string;
}

export default function AnalyticsTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { clearQueue } = useVideoStore();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalVideosPromoted: 0,
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
    totalViewsReceived: 0,
    totalWatchTime: 0,
    activeVideos: 0,
    completedVideos: 0,
    onHoldVideos: 0,
    recentActivities: [],
    promotedVideos: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoreVideos, setShowMoreVideos] = useState(false);
  const [showMoreActivities, setShowMoreActivities] = useState(false);
  const [holdTimers, setHoldTimers] = useState<{[key: string]: number}>({});

  // Add debug logging
  useEffect(() => {
    console.log('Analytics Tab - User:', user?.id);
    console.log('Analytics Tab - Profile:', profile?.username, profile?.coins);
    console.log('Analytics Tab - Loading:', loading);
  }, [user, profile, loading]);

  // Focus effect for initial load and periodic updates
  useFocusEffect(
    useCallback(() => {
      console.log('Analytics Tab - Focus effect triggered, user:', user?.id);
      if (user) {
        fetchAnalytics();
        
        // Set up periodic refresh for hold timers only
        const interval = setInterval(() => {
          updateHoldTimers();
        }, 5000);
        
        // Separate interval for hold status check - less frequent
        const analyticsInterval = setInterval(() => {
          checkVideoHoldStatus();
        }, 30000); // Check hold status every 30 seconds
        
        return () => {
          clearInterval(interval);
          clearInterval(analyticsInterval);
        };
      }
    }, [user])
  );

  const fetchAnalytics = async (isRefresh = false) => {
    console.log('fetchAnalytics called - user:', user?.id, 'isRefresh:', isRefresh);
    if (!user) return;

    // Prevent multiple simultaneous calls unless it's a refresh
    if (loading && !isRefresh) {
      console.log('Already loading, skipping fetch');
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log('Fetching analytics for user:', user.id);

      // Initialize with default values
      let summaryData = {
        total_videos_promoted: 0,
        total_coins_earned: 0,
        total_coins_spent: 0,
        total_views_received: 0,
        total_watch_time: 0,
        active_videos: 0,
        completed_videos: 0,
        on_hold_videos: 0,
      };

      // Try to fetch analytics with timeout
      try {
        const analyticsPromise = supabase
          .rpc('get_user_analytics_summary', { user_uuid: user.id });
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analytics fetch timeout')), 10000)
        );
        
        const { data: analyticsData, error: analyticsError } = await Promise.race([
          analyticsPromise,
          timeoutPromise
        ]) as any;

        console.log('Analytics RPC result:', { analyticsData, analyticsError });

        if (analyticsError) {
          console.error('Analytics RPC error:', analyticsError);
          // Fall back to manual calculation
          await calculateAnalyticsManually();
        } else if (analyticsData && analyticsData.length > 0) {
          summaryData = analyticsData[0];
          console.log('Using RPC analytics data:', summaryData);
        } else {
          console.log('No RPC data, falling back to manual calculation');
          // Fall back to manual calculation
          await calculateAnalyticsManually();
        }
      } catch (rpcError) {
        console.error('RPC function failed, falling back to manual calculation:', rpcError);
        await calculateAnalyticsManually();
      }

      async function calculateAnalyticsManually() {
        console.log('Calculating analytics manually...');
        try {
          // Use Promise.all with timeout for parallel fetching
          const fetchPromises = [
            // Get video count
            supabase
              .from('videos')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id),
            
            // Get coins earned (positive transactions)
            supabase
              .from('coin_transactions')
              .select('amount')
              .eq('user_id', user.id)
              .gt('amount', 0),
            
            // Get coins spent (negative transactions)
            supabase
              .from('coin_transactions')
              .select('amount')
              .eq('user_id', user.id)
              .lt('amount', 0),
            
            // Get video stats
            supabase
              .from('videos')
              .select('views_count, total_watch_time, status')
              .eq('user_id', user.id)
          ];
          
          // Add timeout to all promises
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Manual calculation timeout')), 8000)
          );
          
          const results = await Promise.race([
            Promise.all(fetchPromises),
            timeoutPromise
          ]) as any[];
          
          const [
            { count: videoCount },
            { data: earnedData },
            { data: spentData },
            { data: videoStats }
          ] = results;

          console.log('Video count:', videoCount);
          console.log('Earned data:', earnedData);
          console.log('Spent data:', spentData);
          console.log('Video stats:', videoStats);

          summaryData = {
            total_videos_promoted: videoCount || 0,
            total_coins_earned: earnedData?.reduce((sum, t) => sum + t.amount, 0) || 0,
            total_coins_spent: Math.abs(spentData?.reduce((sum, t) => sum + t.amount, 0) || 0),
            total_views_received: videoStats?.reduce((sum, v) => sum + (v.views_count || 0), 0) || 0,
            total_watch_time: videoStats?.reduce((sum, v) => sum + (v.total_watch_time || 0), 0) || 0,
            active_videos: videoStats?.filter(v => v.status === 'active').length || 0,
            completed_videos: videoStats?.filter(v => v.status === 'completed').length || 0,
            on_hold_videos: videoStats?.filter(v => v.status === 'on_hold').length || 0,
          };
          console.log('Manual calculation result:', summaryData);
        } catch (manualError) {
          console.error('Manual calculation also failed:', manualError);
          // Keep default values
        }
      }

      // Fetch promoted videos with timeout
      let promotedVideos = [];
      try {
        const videosPromise = supabase
          .from('videos')
          .select(`
            *,
            video_views(
              id,
              watched_duration,
              completed,
              coins_earned,
              created_at
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Videos fetch timeout')), 8000)
        );
        
        const { data: videosData, error: videosError } = await Promise.race([
          videosPromise,
          timeoutPromise
        ]) as any;
        
        if (videosError) throw videosError;
        promotedVideos = videosData || [];
      } catch (videosError) {
        console.error('Error fetching videos:', videosError);
        // Continue with empty array
        promotedVideos = [];
      }

      console.log('Promoted videos result:', { promotedVideos });

      // Process videos with enhanced analytics
      const videosWithAnalytics = promotedVideos.map((video) => {
        const progressPercentage = (video.views_count / video.target_views) * 100;
        return {
          ...video,
          display_views_count: video.views_count,
          progress_text: `${video.views_count}/${video.target_views}`,
          completion_rate: progressPercentage,
          fresh_data: true
        };
      });

      console.log('Videos with analytics:', videosWithAnalytics.length);

      // Enhanced profile refresh for guaranteed coin balance updates
      if (isRefresh) {
        await refreshProfile();
      }

      // Fetch recent activity with error handling
      let activityData = [];
      try {
        const activityPromise = supabase
          .from('coin_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Activity fetch timeout')), 5000)
        );
        
        const { data, error: activityError } = await Promise.race([
          activityPromise,
          timeoutPromise
        ]) as any;

        if (activityError) {
          console.error('Error fetching activity:', activityError);
        } else {
          activityData = data || [];
        }
      } catch (activityFetchError) {
        console.error('Activity fetch failed:', activityFetchError);
      }

      console.log('Activity data:', activityData.length);

      // Set analytics data
      setAnalytics({
        totalVideosPromoted: summaryData.total_videos_promoted,
        totalCoinsEarned: summaryData.total_coins_earned,
        totalCoinsSpent: summaryData.total_coins_spent,
        totalViewsReceived: summaryData.total_views_received,
        totalWatchTime: summaryData.total_watch_time,
        activeVideos: summaryData.active_videos,
        completedVideos: summaryData.completed_videos,
        onHoldVideos: summaryData.on_hold_videos,
        recentActivities: activityData,
        promotedVideos: videosWithAnalytics,
      });

      // Update hold timers for videos on hold
      const holdVideos = videosWithAnalytics.filter(v => v.status === 'on_hold');
      const newHoldTimers: {[key: string]: number} = {};
      holdVideos.forEach(video => {
        let holdUntilTime: Date;
        
        if (video.hold_until) {
          holdUntilTime = new Date(video.hold_until);
        } else {
          holdUntilTime = new Date(video.created_at);
          holdUntilTime.setMinutes(holdUntilTime.getMinutes() + 10);
        }
        
        const remainingMs = holdUntilTime.getTime() - new Date().getTime();
        newHoldTimers[video.id] = Math.max(0, Math.floor(remainingMs / 1000));
      });
      setHoldTimers(newHoldTimers);

    } catch (error) {
      console.error('Error fetching analytics:', error);
      
      // Always set analytics data to prevent infinite loading
      setAnalytics({
        totalVideosPromoted: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        totalViewsReceived: 0,
        totalWatchTime: 0,
        activeVideos: 0,
        completedVideos: 0,
        onHoldVideos: 0,
        recentActivities: [],
        promotedVideos: [],
      });
      
      console.warn('Analytics fetch failed, using default values');
    } finally {
      console.log('Analytics fetch completed, setting loading to false');
      // Always set loading to false to prevent stuck state
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Add timeout for initial load to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.warn('Analytics loading timeout - forcing completion');
        setLoading(false);
        setRefreshing(false);
        
        // Set default analytics if still loading
        setAnalytics(prev => prev.totalVideosPromoted === 0 ? {
          totalVideosPromoted: 0,
          totalCoinsEarned: 0,
          totalCoinsSpent: 0,
          totalViewsReceived: 0,
          totalWatchTime: 0,
          activeVideos: 0,
          completedVideos: 0,
          onHoldVideos: 0,
          recentActivities: [],
          promotedVideos: [],
        } : prev);
      }, 15000); // 15 second timeout
      
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  const checkVideoHoldStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('release_videos_from_hold');
      
      if (error) throw error;
      
      if (data > 0) {
        console.log(`📊 Released ${data} videos from hold to queue`);
        // Only refresh analytics if videos were actually released
        fetchAnalytics();
        clearQueue();
      }
    } catch (error) {
      console.error('Error checking video hold status:', error);
    }
  };

  const updateHoldTimers = () => {
    setHoldTimers(prev => {
      const updated = { ...prev };
      let hasChanges = false;
      
      Object.keys(updated).forEach(videoId => {
        if (updated[videoId] > 0) {
          updated[videoId] = Math.max(0, updated[videoId] - 5);
          hasChanges = true;
        } else if (updated[videoId] <= 0) {
          delete updated[videoId];
          hasChanges = true;
        }
      });
      
      return hasChanges ? updated : prev;
    });
  };

  const handleEditVideo = (video: PromotedVideo) => {
    router.push({
      pathname: '/edit-video',
      params: {
        videoId: video.id,
      }
    });
  };

  const toggleVideosExpansion = () => {
    setShowMoreVideos(!showMoreVideos);
  };

  const toggleActivitiesExpansion = () => {
    setShowMoreActivities(!showMoreActivities);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'video_watch': return <Eye color="#4ECDC4" size={16} />;
      case 'video_promotion': return <Video color="#FF4757" size={16} />;
      case 'purchase': return <DollarSign color="#FFA726" size={16} />;
      case 'admin_adjustment': return <Activity color="#9B59B6" size={16} />;
      case 'referral_bonus': return <Play color="#2ECC71" size={16} />;
      default: return <Activity color="#666" size={16} />;
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'video_watch':
        return '+';
      case 'video_promotion':
        return '-';
      case 'purchase':
        return '+';
      case 'referral_bonus':
        return '+';
      default:
        return '•';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'video_watch':
      case 'purchase':
      case 'referral_bonus':
        return '#2ECC71';
      case 'video_promotion':
        return '#E74C3C';
      default:
        return '#666';
    }
  };

  const displayedVideos = showMoreVideos ? analytics.promotedVideos : analytics.promotedVideos.slice(0, 4);
  const displayedActivities = showMoreActivities ? analytics.recentActivities : analytics.recentActivities.slice(0, 3);

  if (loading) {
    return (
      <View style={styles.container}>
        <GlobalHeader 
          title="Analytics" 
          menuVisible={menuVisible} 
          setMenuVisible={setMenuVisible} 
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlobalHeader 
        title="Analytics" 
        showCoinDisplay={true} 
        menuVisible={menuVisible} 
        setMenuVisible={setMenuVisible} 
      />

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAnalytics(true)}
            tintColor="#800080"
            colors={['#800080']}
          />
        }
      >
        {/* Primary Metrics */}
        <View style={styles.metricsSection}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: '#800080' }]}>
              <Video color="white" size={24} />
            </View>
            <Text style={styles.metricValue}>{analytics.totalVideosPromoted}</Text>
            <Text style={styles.metricLabel}>Videos Promoted</Text>
          </View>
          
          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: '#2ECC71' }]}>
              <Coins size={24} color="white" />
            </View>
            <Text style={styles.metricValue}>{analytics.totalCoinsEarned}</Text>
            <Text style={styles.metricLabel}>Coins Earned</Text>
          </View>
        </View>

        {/* Video Status Overview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Promoted Videos</Text>
            <TouchableOpacity onPress={() => fetchAnalytics(true)}>
              <RefreshCw size={20} color="#800080" />
            </TouchableOpacity>
          </View>

          <View style={styles.promotedVideosContainer}>
            {analytics.totalVideosPromoted > 0 ? (
              <View style={styles.videoStats}>
                <View style={styles.videoStatItem}>
                  <Text style={styles.videoStatNumber}>{analytics.activeVideos}</Text>
                  <Text style={styles.videoStatLabel}>Active</Text>
                </View>
                <View style={styles.videoStatItem}>
                  <Text style={styles.videoStatNumber}>{analytics.onHoldVideos}</Text>
                  <Text style={styles.videoStatLabel}>On Hold</Text>
                </View>
                <View style={styles.videoStatItem}>
                  <Text style={styles.videoStatNumber}>{analytics.completedVideos}</Text>
                  <Text style={styles.videoStatLabel}>Completed</Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Video size={48} color="#CCC" />
                <Text style={styles.emptyStateTitle}>No promoted videos</Text>
                <Text style={styles.emptyStateText}>
                  Go to the Promote tab to start promoting your videos
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Detailed Videos List */}
        {analytics.promotedVideos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Video Details</Text>
            <View style={styles.videosList}>
              {displayedVideos.map((video) => (
                <View key={video.id} style={styles.videoItem}>
                  <View style={styles.videoInfo}>
                    <Text style={styles.videoTitle} numberOfLines={2}>
                      {video.title}
                    </Text>
                    <Text style={[styles.videoStats, video.views_count >= video.target_views && styles.completedStats]}>
                      <Text>{video.display_views_count || video.views_count}/{video.target_views} views</Text>
                      {video.completion_rate >= 100 && ' ✓'}
                    </Text>
                    <View style={styles.videoMeta}>
                      <Text style={styles.videoDate}>
                        {formatDate(video.created_at)}
                      </Text>
                      <View style={styles.videoStatusContainer}>
                        {video.status === 'on_hold' && holdTimers[video.id] && (
                          <View style={styles.holdTimer}>
                            <Timer color="#F39C12" size={12} />
                            <Text style={styles.holdTimerText}>
                              {formatHoldTimer(holdTimers[video.id])}
                            </Text>
                          </View>
                        )}
                        {video.status === 'repromoted' && (
                          <View style={styles.repromoteIndicator}>
                            <Play color="#9B59B6" size={12} />
                            <Text style={styles.repromoteText}>REPROMOTED</Text>
                          </View>
                        )}
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(video.status) }]}>
                          <Text style={styles.statusText}>
                            {getStatusText(video.status)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.editButton}
                    onPress={() => handleEditVideo(video)}
                  >
                    <Edit3 color="#800080" size={20} />
                  </TouchableOpacity>
                </View>
              ))}
              
              {analytics.promotedVideos.length > 4 && (
                <TouchableOpacity 
                  style={styles.viewMoreButton}
                  onPress={toggleVideosExpansion}
                >
                  <Text style={styles.viewMoreText}>
                    {showMoreVideos ? 'View Less' : `View More (${analytics.promotedVideos.length - 4})`}
                  </Text>
                  {showMoreVideos ? (
                    <ChevronUp color="#800080" size={20} />
                  ) : (
                    <ChevronDown color="#800080" size={20} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Recent Activity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          
          {analytics.recentActivities.length > 0 ? (
            <View style={styles.activitiesList}>
              {displayedActivities.map((activity) => (
                <View key={activity.id} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    {getActivityIcon(activity.transaction_type)}
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityDescription} numberOfLines={2}>
                      {activity.description}
                    </Text>
                    <Text style={styles.activityDate}>
                      {formatDate(activity.created_at)}
                    </Text>
                  </View>
                  <View style={styles.activityRight}>
                    <Text style={[
                      styles.activityAmount,
                      { color: getTransactionColor(activity.transaction_type) }
                    ]}>
                      {getTransactionIcon(activity.transaction_type)}
                      <Text style={styles.coinEmoji}>🪙</Text>
                      {Math.abs(activity.amount)}
                    </Text>
                  </View>
                </View>
              ))}
              
              {analytics.recentActivities.length > 3 && (
                <TouchableOpacity 
                  style={styles.viewMoreButton}
                  onPress={toggleActivitiesExpansion}
                >
                  <Text style={styles.viewMoreText}>
                    {showMoreActivities ? 'View Less' : `View More (${analytics.recentActivities.length - 3})`}
                  </Text>
                  {showMoreActivities ? (
                    <ChevronUp color="#800080" size={20} />
                  ) : (
                    <ChevronDown color="#800080" size={20} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityText}>No recent activity</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
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
  metricsSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: isSmallScreen ? 16 : 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricIcon: {
    width: isSmallScreen ? 40 : 48,
    height: isSmallScreen ? 40 : 48,
    borderRadius: isSmallScreen ? 20 : 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: isSmallScreen ? 20 : 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: isSmallScreen ? 11 : 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  section: {
    margin: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: isSmallScreen ? 16 : 18,
    fontWeight: '600',
    color: '#333',
  },
  promotedVideosContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  videoStatItem: {
    alignItems: 'center',
  },
  videoStatNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  videoStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  videosList: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  videoInfo: {
    flex: 1,
  },
  videoTitle: {
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  videoStats: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  completedStats: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoDate: {
    fontSize: 11,
    color: '#999',
  },
  videoStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  holdTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  holdTimerText: {
    fontSize: 10,
    color: '#F39C12',
    fontWeight: '600',
  },
  repromoteIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  repromoteText: {
    fontSize: 9,
    color: '#9B59B6',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  editButton: {
    padding: 8,
    marginLeft: 12,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  viewMoreText: {
    fontSize: 14,
    color: '#800080',
    fontWeight: '500',
    marginRight: 8,
  },
  activitiesList: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: 16,
    fontWeight: '600',
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinEmoji: {
    fontSize: 14,
    marginHorizontal: 2,
  },
  positiveAmount: {
    color: '#2ECC71',
  },
  negativeAmount: {
    color: '#E74C3C',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActivity: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyActivityText: {
    fontSize: 16,
    color: '#666',
  },
});