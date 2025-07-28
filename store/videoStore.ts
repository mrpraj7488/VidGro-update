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
  resetQueue: () => void;
  clearQueue: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoQueue: [],
  currentVideoIndex: 0,
  isLoading: false,

  fetchVideos: async (userId: string) => {
    set({ isLoading: true });
    try {
      console.log('🎬 Fetching videos for user:', userId);
      const videos = await getVideoQueue(userId);
      console.log('📹 Received videos:', videos?.length || 0);
      
      if (videos && videos.length > 0) {
        // No filtering - use all videos directly
        console.log('✅ All videos loaded:', videos.length);
        set({ 
          videoQueue: videos, 
          currentVideoIndex: 0,
          isLoading: false 
        });
      } else {
        console.log('❌ No videos available');
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
    console.log('📱 Moving to next video: index', currentVideoIndex, 'of', videoQueue.length);
    
    if (currentVideoIndex < videoQueue.length - 1) {
      set({ currentVideoIndex: currentVideoIndex + 1 });
    } else {
      // Loop back to beginning
      set({ currentVideoIndex: 0 });
    }
  },

  resetQueue: () => {
    console.log('🔄 Resetting video queue');
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false
    });
  },

  clearQueue: () => {
    console.log('🗑️ Video queue cleared');
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false
    });
  },
}));