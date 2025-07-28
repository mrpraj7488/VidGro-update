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
}

interface VideoState {
  videoQueue: Video[];
  currentVideoIndex: number;
  isLoading: boolean;
  fetchVideos: (userId: string) => Promise<void>;
  getCurrentVideo: () => Video | null;
  moveToNextVideo: () => void;
  clearQueue: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoQueue: [],
  currentVideoIndex: 0,
  isLoading: false,

  fetchVideos: async (userId: string) => {
    set({ isLoading: true });
    try {
      const videos = await getVideoQueue(userId);
      
      if (videos && videos.length > 0) {
        set({ 
          videoQueue: videos, 
          currentVideoIndex: 0,
          isLoading: false 
        });
      } else {
        set({ videoQueue: [], currentVideoIndex: 0, isLoading: false });
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      set({ isLoading: false });
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
      isLoading: false
    });
  },
}));