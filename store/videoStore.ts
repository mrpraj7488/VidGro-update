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
        // Filter out user's own videos from the feed
        const filteredVideos = videos.filter(video => video.user_id !== userId);
        console.log('🎬 VideoStore: Filtered videos (excluding own):', filteredVideos.length);
        
        set({ 
          videoQueue: filteredVideos, 
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
          error: 'No videos available at the moment'
        });
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to load videos'
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