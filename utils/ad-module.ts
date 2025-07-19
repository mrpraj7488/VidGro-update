import { Platform } from 'react-native';

// Ad configuration and management utilities
export interface AdConfig {
  appId: string;
  bannerId: string;
  interstitialId: string;
  rewardedId: string;
}

export interface AdReward {
  type: string;
  amount: number;
}

// Platform-specific ad configurations
const getAdConfig = (): AdConfig => {
  const config: AdConfig = {
    appId: process.env.EXPO_PUBLIC_ADMOB_APP_ID || '',
    bannerId: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || '',
    interstitialId: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID || '',
    rewardedId: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || '',
  };

  // Use test IDs for development
  if (__DEV__) {
    if (Platform.OS === 'ios') {
      config.bannerId = 'ca-app-pub-3940256099942544/2934735716';
      config.interstitialId = 'ca-app-pub-3940256099942544/4411468910';
      config.rewardedId = 'ca-app-pub-3940256099942544/1712485313';
    } else {
      config.bannerId = 'ca-app-pub-3940256099942544/6300978111';
      config.interstitialId = 'ca-app-pub-3940256099942544/1033173712';
      config.rewardedId = 'ca-app-pub-3940256099942544/5224354917';
    }
  }

  return config;
};

// Ad loading and display utilities
export class AdManager {
  private static instance: AdManager;
  private config: AdConfig;
  private isInitialized = false;

  private constructor() {
    this.config = getAdConfig();
  }

  public static getInstance(): AdManager {
    if (!AdManager.instance) {
      AdManager.instance = new AdManager();
    }
    return AdManager.instance;
  }

  public async initialize(): Promise<boolean> {
    try {
      // Initialize ad SDK here
      // For now, we'll simulate initialization
      this.isInitialized = true;
      console.log('Ad SDK initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize ad SDK:', error);
      return false;
    }
  }

  public async loadBannerAd(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Load banner ad
      console.log('Loading banner ad:', this.config.bannerId);
      return true;
    } catch (error) {
      console.error('Failed to load banner ad:', error);
      return false;
    }
  }

  public async loadInterstitialAd(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Load interstitial ad
      console.log('Loading interstitial ad:', this.config.interstitialId);
      return true;
    } catch (error) {
      console.error('Failed to load interstitial ad:', error);
      return false;
    }
  }

  public async loadRewardedAd(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Load rewarded ad
      console.log('Loading rewarded ad:', this.config.rewardedId);
      return true;
    } catch (error) {
      console.error('Failed to load rewarded ad:', error);
      return false;
    }
  }

  public async showInterstitialAd(): Promise<boolean> {
    try {
      // Show interstitial ad
      console.log('Showing interstitial ad');
      return true;
    } catch (error) {
      console.error('Failed to show interstitial ad:', error);
      return false;
    }
  }

  public async showRewardedAd(): Promise<AdReward | null> {
    try {
      // Show rewarded ad and return reward
      console.log('Showing rewarded ad');
      
      // Simulate ad completion with reward
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            type: 'coins',
            amount: 50
          });
        }, 3000); // Simulate 3-second ad
      });
    } catch (error) {
      console.error('Failed to show rewarded ad:', error);
      return null;
    }
  }

  public isAdLoaded(adType: 'banner' | 'interstitial' | 'rewarded'): boolean {
    // Check if specific ad type is loaded
    console.log(`Checking if ${adType} ad is loaded`);
    return true; // Simulate loaded state
  }

  public getConfig(): AdConfig {
    return this.config;
  }
}

// Ad frequency management
export class AdFrequencyManager {
  private static readonly STORAGE_KEY = 'ad_frequency_data';
  private static instance: AdFrequencyManager;
  
  private adCounts: { [key: string]: number } = {};
  private lastAdShown: { [key: string]: number } = {};

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): AdFrequencyManager {
    if (!AdFrequencyManager.instance) {
      AdFrequencyManager.instance = new AdFrequencyManager();
    }
    return AdFrequencyManager.instance;
  }

  private async loadFromStorage(): Promise<void> {
    try {
      // Load ad frequency data from AsyncStorage
      // For now, we'll use default values
      this.adCounts = {};
      this.lastAdShown = {};
    } catch (error) {
      console.error('Failed to load ad frequency data:', error);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      // Save ad frequency data to AsyncStorage
      console.log('Saving ad frequency data');
    } catch (error) {
      console.error('Failed to save ad frequency data:', error);
    }
  }

  public canShowAd(adType: string, minInterval: number = 60000): boolean {
    const now = Date.now();
    const lastShown = this.lastAdShown[adType] || 0;
    
    return (now - lastShown) >= minInterval;
  }

  public recordAdShown(adType: string): void {
    this.adCounts[adType] = (this.adCounts[adType] || 0) + 1;
    this.lastAdShown[adType] = Date.now();
    this.saveToStorage();
  }

  public getAdCount(adType: string): number {
    return this.adCounts[adType] || 0;
  }

  public resetAdCounts(): void {
    this.adCounts = {};
    this.lastAdShown = {};
    this.saveToStorage();
  }
}

// Utility functions for ad integration
export const initializeAds = async (): Promise<boolean> => {
  const adManager = AdManager.getInstance();
  return await adManager.initialize();
};

export const showRewardedAdForCoins = async (): Promise<number> => {
  const adManager = AdManager.getInstance();
  const frequencyManager = AdFrequencyManager.getInstance();
  
  if (!frequencyManager.canShowAd('rewarded', 30000)) { // 30 second cooldown
    throw new Error('Please wait before watching another ad');
  }

  const reward = await adManager.showRewardedAd();
  if (reward && reward.type === 'coins') {
    frequencyManager.recordAdShown('rewarded');
    return reward.amount;
  }
  
  return 0;
};

export const showInterstitialAfterVideos = async (videoCount: number): Promise<boolean> => {
  const adManager = AdManager.getInstance();
  const frequencyManager = AdFrequencyManager.getInstance();
  
  // Show interstitial every 5 videos
  if (videoCount % 5 === 0 && frequencyManager.canShowAd('interstitial', 120000)) { // 2 minute cooldown
    const success = await adManager.showInterstitialAd();
    if (success) {
      frequencyManager.recordAdShown('interstitial');
    }
    return success;
  }
  
  return false;
};

// Platform compatibility check
export const isAdSupportedPlatform = (): boolean => {
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

// Ad-free session management
export interface AdFreeSession {
  isActive: boolean;
  expiresAt: Date | null;
  hoursRemaining: number;
}

export const getAdFreeStatus = (): AdFreeSession => {
  // This would typically read from AsyncStorage or global state
  return {
    isActive: false,
    expiresAt: null,
    hoursRemaining: 0
  };
};

export const startAdFreeSession = (hours: number): void => {
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  // Save to AsyncStorage or global state
  console.log(`Started ${hours}-hour ad-free session until ${expiresAt}`);
};

export default AdManager;