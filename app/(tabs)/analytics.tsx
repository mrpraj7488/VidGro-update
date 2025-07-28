import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import GlobalHeader from '../../components/GlobalHeader';
import { ChartBar as BarChart3, Eye, Coins, Play, Pause, CircleCheck as CheckCircle, Timer, CreditCard as Edit3, Activity, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react-native';

interface UserAnalytics {
  total_videos_promoted: number;
  total_coins_earned: number;
  active_videos: number;
  completed_videos: number;
  on_hold_videos: number;
}

interface RecentActivity {
  id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

interface VideoAnalytics {
  id: string;
  title: string;
  views_count: number;
  target_views: number;
  status: string;
  created_at: string;
  coin_cost: number;
  completion_rate: number;
}

export default function Analytics() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [videos, setVideos] = useState<VideoAnalytics[]>([]);
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
      
      // Set up periodic status checking for hold videos
      const statusCheckInterval = setInterval(() => {
        // Check for expired holds every 5 seconds
        supabase.rpc('check_and_update_expired_holds').then(({ data: updatedCount }) => {
          if (updatedCount && updatedCount > 0) {
            console.log(`${updatedCount} videos automatically activated from hold`);
            // Refresh analytics after status updates
            fetchAnalytics();
          }
        }).catch(error => {
          console.error('Error checking expired holds:', error);
        });
      }, 5000);
      
      return () => clearInterval(statusCheckInterval);
    }
  }, [user]);

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch user analytics summary using the fixed function
      const { data: analyticsData, error: analyticsError } = await supabase
        .rpc('get_user_analytics_summary_fixed', { user_uuid: user.id });

      if (analyticsError) {
        console.error('Analytics error:', analyticsError);
        Alert.alert('Error', 'Failed to load analytics data');
        return;
      }

      if (analyticsData && analyticsData.length > 0) {
        setAnalytics(analyticsData[0]);
      }

      // Fetch recent activity (excluding video_watch rewards)
      const { data: activityData, error: activityError } = await supabase
        .from('coin_transactions')
        .select('id, amount, transaction_type, description, created_at')
        .eq('user_id', user.id)
        .in('transaction_type', [
          'video_promotion', 
          'purchase', 
          'referral_bonus', 
          'admin_adjustment', 
          'vip_purchase', 
          'ad_stop_purchase',
          'video_deletion_refund'
        ])
        .order('created_at', { ascending: false })
        .limit(10);

      if (activityError) {
        console.error('Activity error:', activityError);
      } else if (activityData) {
        setRecentActivity(activityData);
      }

      // Alternative: Use the RPC function if it exists
      /* const { data: activityData, error: activityError } = await supabase
        .rpc('get_user_transaction_history', { 
          user_uuid: user.id, 
          limit_count: 10,
          offset_count: 0
        });

      if (activityError) {
        console.error('Activity error:', activityError);
      } else if (activityData) {
        setRecentActivity(activityData);
      } */

      // Fetch user's videos with analytics
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select(`
          id,
          title,
          views_count,
          target_views,
          status,
          created_at,
          coin_cost
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (videosError) {
        console.error('Videos error:', videosError);
      } else if (videosData) {
        const videosWithCompletion = videosData.map(video => ({
          ...video,
          completion_rate: video.target_views > 0 
            ? Math.round((video.views_count / video.target_views) * 100)
            : 0
        }));
        setVideos(videosWithCompletion);
      }

    } catch (error) {
      console.error('Error fetching analytics:', error);
      Alert.alert('Error', 'Something went wrong while loading analytics');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return Play;
      case 'completed': return CheckCircle;
      case 'paused': return Pause;
      case 'on_hold': return Timer;
      case 'repromoted': return TrendingUp;
      default: return Play;
    }
  };

  const formatTransactionType = (type: string) => {
    switch (type) {
      case 'video_promotion': return 'Video Promotion';
      case 'purchase': return 'Coin Purchase';
      case 'referral_bonus': return 'Referral Bonus';
      case 'admin_adjustment': return 'Admin Adjustment';
      case 'vip_purchase': return 'VIP Purchase';
      case 'video_deletion_refund': return 'Video Deletion Refund';
      default: return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleVideoPress = (video: VideoAnalytics) => {
    router.push({
      pathname: '/edit-video',
      params: { videoData: JSON.stringify(video) }
    });
  };

  const getDisplayedVideos = () => {
    return showAllVideos ? videos : videos.slice(0, 1);
  };

  const getDisplayedActivity = () => {
    return showAllActivity ? recentActivity : recentActivity.slice(0, 1);
  };

  const getRemainingCount = (total: number, displayed: number) => {
    return Math.max(0, total - displayed);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <GlobalHeader 
          title="Analytics" 
          showCoinDisplay={true}
          menuVisible={menuVisible} 
          setMenuVisible={setMenuVisible} 
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#800080" />
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
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Cards - Only 2 columns */}
        <View style={styles.overviewSection}>
          <Text style={styles.sectionTitle}>Overview</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <Play size={20} color="#3498DB" />
                <Text style={styles.statLabel}>Videos Promoted</Text>
              </View>
              <Text style={styles.statValue}>
                {analytics?.total_videos_promoted || 0}
              </Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <Coins size={20} color="#FFD700" />
                <Text style={styles.statLabel}>Coins Earned</Text>
              </View>
              <Text style={styles.statValue}>
                {analytics?.total_coins_earned || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* Video Status Summary */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Video Status</Text>
          
          <View style={styles.statusGrid}>
            <View style={[styles.statusCard, { borderLeftColor: '#2ECC71' }]}>
              <Text style={styles.statusNumber}>{analytics?.active_videos || 0}</Text>
              <Text style={styles.statusLabel}>Active</Text>
            </View>
            
            <View style={[styles.statusCard, { borderLeftColor: '#3498DB' }]}>
              <Text style={styles.statusNumber}>{analytics?.completed_videos || 0}</Text>
              <Text style={styles.statusLabel}>Completed</Text>
            </View>
            
            <View style={[styles.statusCard, { borderLeftColor: '#F39C12' }]}>
              <Text style={styles.statusNumber}>{analytics?.on_hold_videos || 0}</Text>
              <Text style={styles.statusLabel}>On Hold</Text>
            </View>
          </View>
        </View>

        {/* Promoted Videos */}
        <View style={styles.videosSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Promoted Videos</Text>
            <BarChart3 size={20} color="#800080" />
          </View>
          
          {videos.length === 0 ? (
            <View style={styles.emptyState}>
              <Play size={48} color="#CCC" />
              <Text style={styles.emptyTitle}>No Videos Yet</Text>
              <Text style={styles.emptyText}>
                Start promoting your videos to see analytics here
              </Text>
            </View>
          ) : (
            <>
              {getDisplayedVideos().map((video) => {
                const StatusIcon = getStatusIcon(video.status);
                return (
                  <TouchableOpacity
                    key={video.id}
                    style={styles.videoCard}
                    onPress={() => handleVideoPress(video)}
                  >
                    <View style={styles.videoHeader}>
                      <View style={styles.videoTitleContainer}>
                        <Text style={styles.videoTitle} numberOfLines={2}>
                          {video.title}
                        </Text>
                        <Text style={styles.videoDate}>
                          {formatDate(video.created_at)}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.editButton}>
                        <Edit3 size={16} color="#666" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.videoStats}>
                      <View style={styles.videoStat}>
                        <Eye size={16} color="#666" />
                        <Text style={styles.videoStatText}>
                          {video.views_count}/{video.target_views}
                        </Text>
                      </View>
                      
                      <View style={styles.videoStat}>
                        <StatusIcon size={16} color={getStatusColor(video.status)} />
                        <Text style={[styles.videoStatText, { color: getStatusColor(video.status) }]}>
                          {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View 
                          style={[
                            styles.progressFill, 
                            { 
                              width: `${Math.min(video.completion_rate, 100)}%`,
                              backgroundColor: getStatusColor(video.status)
                            }
                          ]} 
                        />
                      </View>
                      <Text style={styles.progressText}>{video.completion_rate}%</Text>
                    </View>

                    <View style={styles.videoCosts}>
                      <Text style={styles.costText}>
                        Spent: 🪙{video.coin_cost}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              
              {videos.length > 1 && (
                <TouchableOpacity
                  style={styles.viewMoreButton}
                  onPress={() => setShowAllVideos(!showAllVideos)}
                >
                  <Text style={styles.viewMoreText}>
                    {showAllVideos 
                      ? 'Show Less' 
                      : `View More (${getRemainingCount(videos.length, 1)} more)`
                    }
                  </Text>
                  {showAllVideos ? (
                    <ChevronUp size={16} color="#800080" />
                  ) : (
                    <ChevronDown size={16} color="#800080" />
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Activity size={20} color="#800080" />
          </View>
          
          {recentActivity.length === 0 ? (
            <View style={styles.emptyState}>
              <Activity size={48} color="#CCC" />
              <Text style={styles.emptyTitle}>No Recent Activity</Text>
              <Text style={styles.emptyText}>
                Your coin transactions will appear here
              </Text>
            </View>
          ) : (
            <>
              {getDisplayedActivity().map((activity) => (
                <View key={activity.id} style={styles.activityCard}>
                  <View style={styles.activityHeader}>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityType}>
                        {formatTransactionType(activity.transaction_type)}
                      </Text>
                      <Text style={styles.activityDate}>
                        {formatDate(activity.created_at)}
                      </Text>
                    </View>
                    <Text style={[
                      styles.activityAmount,
                      { color: activity.amount > 0 ? '#2ECC71' : '#E74C3C' }
                    ]}>
                      {activity.amount > 0 ? '+' : ''}{activity.amount} 🪙
                    </Text>
                  </View>
                  <Text style={styles.activityDescription} numberOfLines={2}>
                    {activity.description}
                  </Text>
                </View>
              ))}
              
              {recentActivity.length > 1 && (
                <TouchableOpacity
                  style={styles.viewMoreButton}
                  onPress={() => setShowAllActivity(!showAllActivity)}
                >
                  <Text style={styles.viewMoreText}>
                    {showAllActivity 
                      ? 'Show Less' 
                      : `View More (${getRemainingCount(recentActivity.length, 1)} more)`
                    }
                  </Text>
                  {showAllActivity ? (
                    <ChevronUp size={16} color="#800080" />
                  ) : (
                    <ChevronDown size={16} color="#800080" />
                  )}
                </TouchableOpacity>
              )}
            </>
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
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  overviewSection: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statusSection: {
    marginBottom: 24,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statusCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
  activitySection: {
    marginBottom: 24,
  },
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  activityInfo: {
    flex: 1,
  },
  activityType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 12,
    color: '#999',
  },
  activityAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  activityDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  videosSection: {
    marginBottom: 24,
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  videoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  videoTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    lineHeight: 22,
    marginBottom: 4,
  },
  videoDate: {
    fontSize: 12,
    color: '#999',
  },
  editButton: {
    padding: 4,
  },
  videoStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  videoStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoStatText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    minWidth: 35,
  },
  videoCosts: {
    alignItems: 'flex-end',
  },
  costText: {
    fontSize: 12,
    color: '#999',
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#800080',
  },
});