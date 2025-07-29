import { create } from 'zustand';
import { getVideoQueue } from '../lib/supabase';

interface Video {
  video_id: string;
  youtube_url: string;
  title: string;
  duration_seconds: number;
  coin_reward: number;
  views_count: number;
  target_views: number;
  status: string;
  user_id: string;
  completed?: boolean;
}

interface VideoState {
  videoQueue: Video[];
  currentVideoIndex: number;
  isLoading: boolean;
  error: string | null;
  canLoop: boolean;
  fetchVideos: (userId: string) => Promise<void>;
  getCurrentVideo: () => Video | null;
  moveToNextVideo: () => void;
  clearQueue: () => void;
  checkQueueLoop: (userId: string) => Promise<boolean>;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoQueue: [],
  currentVideoIndex: 0,
  isLoading: false,
  error: null,
  canLoop: true,

  fetchVideos: async (userId: string) => {
    console.log('🎬 VideoStore: Starting to fetch looping videos for user:', userId);
    set({ isLoading: true, error: null });
    
    try {
      const videos = await getVideoQueue(userId);
      console.log('🎬 VideoStore: Received videos from API:', videos?.length || 0);
      
      if (videos && videos.length > 0) {
        // Enhanced safety filter for the new schema
        const safeVideos = videos.filter(video => 
          video.video_id && 
          video.youtube_url && 
          video.title &&
          video.duration_seconds > 0 &&
          video.coin_reward > 0 &&
          video.completed !== true // Exclude completed videos from queue
        );
        console.log('🎬 VideoStore: Safe videos after validation:', safeVideos.length);
        
        set({ 
          videoQueue: safeVideos, 
          currentVideoIndex: 0,
          isLoading: false,
          error: null,
          canLoop: true
        });
      } else {
        console.log('🎬 VideoStore: No videos received from API');
        set({ 
          videoQueue: [], 
          currentVideoIndex: 0, 
          isLoading: false,
          error: 'No videos available. Videos will loop automatically when available!',
          canLoop: true
        });
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to load videos. Please check your connection.',
        canLoop: false
      });
    }
  },

  getCurrentVideo: () => {
    const { videoQueue, currentVideoIndex } = get();
    return videoQueue[currentVideoIndex] || null;
  },

  moveToNextVideo: () => {
    const { videoQueue, currentVideoIndex } = get();
    
    if (currentVideoIndex < videoQueue.length - 1) {
      set({ currentVideoIndex: currentVideoIndex + 1 });
    } else {
      // Loop back to beginning for continuous playback
      console.log('🔄 VideoStore: Looping back to first video');
      set({ currentVideoIndex: 0 });
    }
  },

  clearQueue: () => {
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      error: null,
      canLoop: true
    });
  },

  checkQueueLoop: async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('check_and_loop_video_queue', {
        user_uuid: userId
      });
      
      if (error) {
        console.error('Error checking queue loop:', error);
        return false;
      }
      
      return data;
    } catch (error) {
      console.error('checkQueueLoop error:', error);
      return false;
    }
  },
}));