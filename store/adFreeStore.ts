import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AdFreeState {
  isAdFreeActive: boolean;
  adFreeExpiresAt: Date | null;
  selectedOption: number;
  startAdFreeSession: (hours: number) => void;
  updateTimer: () => void;
  endAdFreeSession: () => void;
  loadAdFreeStatus: () => Promise<void>;
}

export const useAdFreeStore = create<AdFreeState>((set, get) => ({
  isAdFreeActive: false,
  adFreeExpiresAt: null,
  selectedOption: 5, // Default 5 hours

  startAdFreeSession: async (hours: number) => {
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    set({ 
      isAdFreeActive: true, 
      adFreeExpiresAt: expiresAt,
      selectedOption: hours
    });
    
    // Save to storage
    await AsyncStorage.setItem('adFreeExpiresAt', expiresAt.toISOString());
  },

  updateTimer: () => {
    const { adFreeExpiresAt } = get();
    if (adFreeExpiresAt && new Date() >= adFreeExpiresAt) {
      get().endAdFreeSession();
    }
  },

  endAdFreeSession: async () => {
    set({ 
      isAdFreeActive: false, 
      adFreeExpiresAt: null 
    });
    
    // Remove from storage
    await AsyncStorage.removeItem('adFreeExpiresAt');
  },

  loadAdFreeStatus: async () => {
    try {
      const stored = await AsyncStorage.getItem('adFreeExpiresAt');
      if (stored) {
        const expiresAt = new Date(stored);
        if (new Date() < expiresAt) {
          set({ 
            isAdFreeActive: true, 
            adFreeExpiresAt: expiresAt 
          });
        } else {
          get().endAdFreeSession();
        }
      }
    } catch (error) {
      console.error('Error loading ad-free status:', error);
    }
  },
}));