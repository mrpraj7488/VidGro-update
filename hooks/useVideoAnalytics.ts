import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface VideoAnalytics {
  video_id: string;
  title: string;
  views_count: number;
  target_views: number;
  total_watch_time: number;
  completion_rate: number;
  average_watch_time: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AnalyticsSummary {
  total_videos_promoted: number;
  total_coins_earned: number;
  total_coins_spent: number;
  total_views_received: number;
  total_watch_time: number;
  active_videos: number;
  completed_videos: number;
  on_hold_videos: number;
}

export function useVideoAnalytics(userId: string | undefined) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [videos, setVideos] = useState<VideoAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch analytics summary
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('get_user_analytics_summary', { user_uuid: userId });

      if (summaryError) {
        throw summaryError;
      }

      setAnalytics(summaryData[0] || {
        total_videos_promoted: 0,
        total_coins_earned: 0,
        total_coins_spent: 0,
        total_views_received: 0,
        total_watch_time: 0,
        active_videos: 0,
        completed_videos: 0,
        on_hold_videos: 0,
      });

      // Fetch user's videos
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (videosError) {
        throw videosError;
      }

      setVideos(videosData || []);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalytics = () => {
    fetchAnalytics();
  };

  useEffect(() => {
    fetchAnalytics();
  }, [userId]);

  // Set up real-time subscription for videos
  useEffect(() => {
    if (!userId) return;

    const subscription = supabase
      .channel('user_videos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'videos',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchAnalytics();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  return {
    analytics,
    videos,
    loading,
    error,
    refreshAnalytics,
  };
}

export function useVideoDetails(videoId: string | undefined) {
  const [video, setVideo] = useState<VideoAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;

    const fetchVideoDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('videos')
          .select('*')
          .eq('id', videoId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        setVideo(data);
      } catch (err) {
        console.error('Error fetching video details:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch video details');
      } finally {
        setLoading(false);
      }
    };

    fetchVideoDetails();

    // Set up real-time subscription for this specific video
    const subscription = supabase
      .channel(`video_${videoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: `id=eq.${videoId}`,
        },
        (payload) => {
          setVideo(payload.new as VideoAnalytics);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [videoId]);

  return { video, loading, error };
}