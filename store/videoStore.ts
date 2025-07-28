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
}

interface VideoState {
  videoQueue: Video[];
  currentVideoIndex: number;
  isLoading: boolean;
  error: string | null;
  fetchVideos: (userId: string) => Promise<void>;
  getCurrentVideo: () => Video | null;
  moveToNextVideo: () => void;
  clearQueue: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoQueue: [],
  currentVideoIndex: 0,
  isLoading: false,
  error: null,

  fetchVideos: async (userId: string) => {
    console.log('🎬 VideoStore: Starting to fetch videos for user:', userId);
    set({ isLoading: true, error: null });
    
    try {
      const videos = await getVideoQueue(userId);
      console.log('🎬 VideoStore: Received videos from API:', videos?.length || 0);
      
      if (videos && videos.length > 0) {
        // The SQL function now handles filtering, so we can use videos directly
        // But let's add a safety filter just in case
        const safeVideos = videos.filter(video => 
          video.video_id && 
          video.youtube_url && 
          video.title &&
          video.duration_seconds > 0 &&
          video.coin_reward > 0
        );
        console.log('🎬 VideoStore: Safe videos after validation:', safeVideos.length);
        
        set({ 
          videoQueue: safeVideos, 
          currentVideoIndex: 0,
          isLoading: false,
          error: null
        });
      } else {
        console.log('🎬 VideoStore: No videos received from API');
        set({ 
          videoQueue: [], 
          currentVideoIndex: 0, 
          isLoading: false,
          error: 'No videos available. Try promoting a video first!'
        });
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to load videos. Please check your connection.'
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
      set({ currentVideoIndex: 0 });
    }
  },

  clearQueue: () => {
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      error: null
    });
  },
}));