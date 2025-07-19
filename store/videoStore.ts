import { create } from 'zustand';
import { getNextVideoForUser } from '../lib/supabase';

interface Video {
  video_id: string;
  youtube_url: string;
  title: string;
  duration_seconds: number;
  coin_reward: number;
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
      const videos = await getNextVideoForUser(userId);
      if (videos && videos.length > 0) {
        const { blacklistedVideoIds } = get();
        const filteredVideos = videos.filter(
          (video: Video) => !blacklistedVideoIds.includes(video.video_id)
        );
        set({ 
          videoQueue: filteredVideos, 
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
      // Reset to beginning or fetch more videos
      set({ currentVideoIndex: 0 });
    }
  },

  handleVideoError: (videoId: string) => {
    const { blacklistedVideoIds } = get();
    set({ 
      blacklistedVideoIds: [...blacklistedVideoIds, videoId] 
    });
    get().moveToNextVideo();
  },

  resetQueue: () => {
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      blacklistedVideoIds: []
    });
  },

  clearQueue: () => {
    console.log('Video queue cleared - forcing refresh');
    set({ 
      videoQueue: [], 
      currentVideoIndex: 0, 
      isLoading: false,
      blacklistedVideoIds: []
    });
  },
}));