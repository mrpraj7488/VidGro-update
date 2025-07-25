import { create } from 'zustand';
import { getNextVideoQueueEnhanced } from '../lib/supabase';

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
  blacklistedVideoIds: string[];
  fetchVideos: (userId: string) => Promise<void>;
  getCurrentVideo: () => Video | null;
  moveToNextVideo: () => void;
  handleVideoError: (videoId: string) => void;
  resetQueue: () => void;
  clearQueue: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoQueue: [],
  currentVideoIndex: 0,
  isLoading: false,
  blacklistedVideoIds: [],

  fetchVideos: async (userId: string) => {
    set({ isLoading: true });
    try {
      console.log('🎬 Fetching videos for user:', userId);
      const videos = await getNextVideoQueueEnhanced(userId);
      console.log('📹 Received videos:', videos?.length || 0);
      
      if (videos && videos.length > 0) {
        const { blacklistedVideoIds } = get();
        const filteredVideos = videos.filter(
          (video: Video) => !blacklistedVideoIds.includes(video.video_id)
        );
        console.log('✅ Filtered videos:', filteredVideos.length);
        set({ 
          videoQueue: filteredVideos, 
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
    console.log('📱 Moving to next video:', {
      currentIndex: currentVideoIndex,
      queueLength: videoQueue.length,
      nextIndex: currentVideoIndex + 1
    });
    
    if (currentVideoIndex < videoQueue.length - 1) {
      set({ currentVideoIndex: currentVideoIndex + 1 });
    } else {
      // Reset to beginning or fetch more videos
      set({ currentVideoIndex: 0 });
    }
  },

  handleVideoError: (videoId: string) => {
    const { blacklistedVideoIds } = get();
    console.log('❌ Handling video error for:', videoId);
    set({ 
      blacklistedVideoIds: [...blacklistedVideoIds, videoId] 
    });
    get().moveToNextVideo();
  },

  resetQueue: () => {
    console.log('🔄 Resetting video queue');
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      blacklistedVideoIds: []
    });
  },

  clearQueue: () => {
    console.log('🗑️ Video queue cleared - forcing refresh');
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      blacklistedVideoIds: []
    });
  },
}));