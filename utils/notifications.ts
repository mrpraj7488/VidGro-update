// Notification utilities for VidGro app

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: number;
  read: boolean;
  type: 'coin_earned' | 'video_completed' | 'promotion_approved' | 'system' | 'referral';
}

export interface NotificationSettings {
  enabled: boolean;
  coinEarnings: boolean;
  videoUpdates: boolean;
  promotions: boolean;
  system: boolean;
  referrals: boolean;
}

const STORAGE_KEYS = {
  NOTIFICATIONS: 'vidgro_notifications',
  SETTINGS: 'vidgro_notification_settings',
  PERMISSION: 'vidgro_notification_permission',
};

// Default notification settings
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  coinEarnings: true,
  videoUpdates: true,
  promotions: true,
  system: true,
  referrals: true,
};

class NotificationManager {
  private static instance: NotificationManager;
  private notifications: NotificationData[] = [];
  private settings: NotificationSettings = DEFAULT_SETTINGS;
  private listeners: ((notifications: NotificationData[]) => void)[] = [];

  private constructor() {
    this.loadNotifications();
    this.loadSettings();
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  // Load notifications from storage
  private async loadNotifications(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (stored) {
        this.notifications = JSON.parse(stored);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  // Save notifications to storage
  private async saveNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Error saving notifications:', error);
    }
  }

  // Load settings from storage
  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  }

  // Save settings to storage
  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }

  // Notify listeners of notification changes
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.notifications));
  }

  // Add notification listener
  public addListener(listener: (notifications: NotificationData[]) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Create and add a new notification
  public async addNotification(
    title: string,
    body: string,
    type: NotificationData['type'],
    data?: any
  ): Promise<void> {
    // Check if notifications are enabled for this type
    if (!this.shouldShowNotification(type)) {
      return;
    }

    const notification: NotificationData = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      body,
      data,
      timestamp: Date.now(),
      read: false,
      type,
    };

    this.notifications.unshift(notification);
    
    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }

    await this.saveNotifications();
    this.notifyListeners();

    // Show system notification if supported
    this.showSystemNotification(notification);
  }

  // Check if notification should be shown based on settings
  private shouldShowNotification(type: NotificationData['type']): boolean {
    if (!this.settings.enabled) return false;

    switch (type) {
      case 'coin_earned':
        return this.settings.coinEarnings;
      case 'video_completed':
        return this.settings.videoUpdates;
      case 'promotion_approved':
        return this.settings.promotions;
      case 'system':
        return this.settings.system;
      case 'referral':
        return this.settings.referrals;
      default:
        return true;
    }
  }

  // Show system notification (platform-specific)
  private showSystemNotification(notification: NotificationData): void {
    if (Platform.OS === 'web') {
      this.showWebNotification(notification);
    } else {
      // For mobile, you would integrate with expo-notifications
      console.log('Mobile notification:', notification);
    }
  }

  // Show web notification
  private showWebNotification(notification: NotificationData): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.body,
        icon: '/assets/images/icon.png',
        tag: notification.id,
      });
    }
  }

  // Request notification permission
  public async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        const granted = permission === 'granted';
        await AsyncStorage.setItem(STORAGE_KEYS.PERMISSION, JSON.stringify(granted));
        return granted;
      }
    } else {
      // For mobile, integrate with expo-notifications
      // const { status } = await Notifications.requestPermissionsAsync();
      // return status === 'granted';
    }
    
    return false;
  }

  // Get all notifications
  public getNotifications(): NotificationData[] {
    return [...this.notifications];
  }

  // Get unread notifications count
  public getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  // Mark notification as read
  public async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      await this.saveNotifications();
      this.notifyListeners();
    }
  }

  // Mark all notifications as read
  public async markAllAsRead(): Promise<void> {
    let hasChanges = false;
    this.notifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await this.saveNotifications();
      this.notifyListeners();
    }
  }

  // Delete notification
  public async deleteNotification(notificationId: string): Promise<void> {
    const index = this.notifications.findIndex(n => n.id === notificationId);
    if (index > -1) {
      this.notifications.splice(index, 1);
      await this.saveNotifications();
      this.notifyListeners();
    }
  }

  // Clear all notifications
  public async clearAll(): Promise<void> {
    this.notifications = [];
    await this.saveNotifications();
    this.notifyListeners();
  }

  // Get notification settings
  public getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  // Update notification settings
  public async updateSettings(newSettings: Partial<NotificationSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
  }

  // Helper methods for common notifications
  public async notifyCoinEarned(amount: number, source: string): Promise<void> {
    await this.addNotification(
      'Coins Earned! 🪙',
      `You earned ${amount} coins from ${source}`,
      'coin_earned',
      { amount, source }
    );
  }

  public async notifyVideoCompleted(videoTitle: string, totalViews: number): Promise<void> {
    await this.addNotification(
      'Video Promotion Completed! 🎉',
      `"${videoTitle}" reached ${totalViews} views`,
      'video_completed',
      { videoTitle, totalViews }
    );
  }

  public async notifyPromotionApproved(videoTitle: string): Promise<void> {
    await this.addNotification(
      'Promotion Approved! ✅',
      `"${videoTitle}" is now live and earning views`,
      'promotion_approved',
      { videoTitle }
    );
  }

  public async notifyReferralBonus(amount: number, friendName?: string): Promise<void> {
    await this.addNotification(
      'Referral Bonus! 🎁',
      `You earned ${amount} coins${friendName ? ` from ${friendName}'s signup` : ' from a referral'}`,
      'referral',
      { amount, friendName }
    );
  }

  public async notifySystemMessage(title: string, message: string): Promise<void> {
    await this.addNotification(title, message, 'system');
  }
}

// Export singleton instance
export const notificationManager = NotificationManager.getInstance();

// React hook for using notifications
export function useNotifications() {
  const [notifications, setNotifications] = React.useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    const updateNotifications = (newNotifications: NotificationData[]) => {
      setNotifications(newNotifications);
      setUnreadCount(newNotifications.filter(n => !n.read).length);
    };

    // Initial load
    updateNotifications(notificationManager.getNotifications());

    // Subscribe to changes
    const unsubscribe = notificationManager.addListener(updateNotifications);

    return unsubscribe;
  }, []);

  return {
    notifications,
    unreadCount,
    markAsRead: notificationManager.markAsRead.bind(notificationManager),
    markAllAsRead: notificationManager.markAllAsRead.bind(notificationManager),
    deleteNotification: notificationManager.deleteNotification.bind(notificationManager),
    clearAll: notificationManager.clearAll.bind(notificationManager),
  };
}

export default notificationManager;