import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useAdFreeStore } from '../store/adFreeStore';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ShieldOff, Clock, Play } from 'lucide-react-native';

export default function ConfigureAdsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const { isAdFreeActive, adFreeExpiresAt, startAdFreeSession, loadAdFreeStatus } = useAdFreeStore();
  const [selectedOption, setSelectedOption] = useState(5);
  const [loading, setLoading] = useState(false);

  const adFreeOptions = [
    { hours: 1, watchAds: 2, description: 'Watch 2 ads for 1 hour ad-free' },
    { hours: 3, watchAds: 5, description: 'Watch 5 ads for 3 hours ad-free' },
    { hours: 5, watchAds: 8, description: 'Watch 8 ads for 5 hours ad-free' },
    { hours: 12, watchAds: 15, description: 'Watch 15 ads for 12 hours ad-free' },
    { hours: 24, watchAds: 25, description: 'Watch 25 ads for 24 hours ad-free' },
  ];

  useEffect(() => {
    loadAdFreeStatus();
  }, []);

  const handleStartAdFreeSession = async () => {
    const option = adFreeOptions.find(opt => opt.hours === selectedOption);
    if (!option) return;

    setLoading(true);
    
    Alert.alert(
      'Watch Ads for Ad-Free Time',
      `You need to watch ${option.watchAds} ads to get ${option.hours} hours of ad-free experience. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start', 
          onPress: async () => {
            // Simulate watching ads
            setTimeout(() => {
              startAdFreeSession(option.hours);
              Alert.alert(
                'Ad-Free Session Started!',
                `You now have ${option.hours} hours of ad-free experience.`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            }, 1000);
          }
        }
      ]
    );
    
    setLoading(false);
  };

  const formatRemainingTime = () => {
    if (!adFreeExpiresAt) return '';
    
    const now = new Date();
    const remaining = adFreeExpiresAt.getTime() - now.getTime();
    
    if (remaining <= 0) return 'Expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#800080', '#FF4757']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Configure Ads</Text>
          <ShieldOff size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isAdFreeActive ? (
          <View style={styles.activeContainer}>
            <View style={styles.activeIcon}>
              <ShieldOff size={48} color="#2ECC71" />
            </View>
            <Text style={styles.activeTitle}>Ad-Free Active</Text>
            <Text style={styles.activeSubtitle}>
              You're currently enjoying an ad-free experience
            </Text>
            <View style={styles.remainingTime}>
              <Clock size={20} color="#666" />
              <Text style={styles.remainingTimeText}>
                {formatRemainingTime()}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Choose how many ads you want to watch to earn ad-free time
            </Text>

            <View style={styles.optionsContainer}>
              {adFreeOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionCard,
                    selectedOption === option.hours && styles.selectedOption
                  ]}
                  onPress={() => setSelectedOption(option.hours)}
                >
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionHours}>{option.hours} Hours</Text>
                    <View style={styles.adCount}>
                      <Play size={16} color="#800080" />
                      <Text style={styles.adCountText}>{option.watchAds} ads</Text>
                    </View>
                  </View>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.startButton, loading && styles.buttonDisabled]}
              onPress={handleStartAdFreeSession}
              disabled={loading}
            >
              <ShieldOff size={20} color="white" />
              <Text style={styles.startButtonText}>
                {loading ? 'Starting...' : 'Start Ad-Free Session'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            1. Select how many hours of ad-free time you want{'\n'}
            2. Watch the required number of ads{'\n'}
            3. Enjoy uninterrupted video watching and earning{'\n'}
            4. VIP members get unlimited ad-free experience
          </Text>
        </View>

        {!profile?.is_vip && (
          <TouchableOpacity
            style={styles.vipButton}
            onPress={() => router.push('/become-vip')}
          >
            <Text style={styles.vipButtonText}>
              Upgrade to VIP for unlimited ad-free experience
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  activeContainer: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E8F5E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  activeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  activeSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  remainingTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  remainingTimeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedOption: {
    borderColor: '#800080',
    shadowColor: '#800080',
    shadowOpacity: 0.2,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionHours: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  adCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  adCountText: {
    fontSize: 12,
    color: '#800080',
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#800080',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  vipButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  vipButtonText: {
    color: '#800080',
    fontSize: 16,
    fontWeight: 'bold',
  },
});