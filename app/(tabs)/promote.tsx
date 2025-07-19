import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { createVideoWithHold, supabase } from '../../lib/supabase';
import GlobalHeader from '../../components/GlobalHeader';
import VideoPreview from '../../components/VideoPreview';
import { Link, ChevronDown, TrendingUp } from 'lucide-react-native';
import { calculatePromotionCost, calculateCoinReward } from '../../utils/validation';

export default function PromoteTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [title, setTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isVideoValid, setIsVideoValid] = useState(false);
  const [selectedViews, setSelectedViews] = useState<number | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);

  const viewsOptions = [
    { label: '10 Views', value: 10, cost: 20 },
    { label: '25 Views', value: 25, cost: 50 },
    { label: '50 Views', value: 50, cost: 100 },
    { label: '100 Views', value: 100, cost: 200 },
    { label: '250 Views', value: 250, cost: 500 },
    { label: '500 Views', value: 500, cost: 1000 },
    { label: '1000 Views', value: 1000, cost: 2000 },
  ];

  const durationOptions = [
    { label: '30 seconds (5 coins)', value: 30, reward: 5 },
    { label: '45 seconds (15 coins)', value: 45, reward: 15 },
    { label: '60 seconds (25 coins)', value: 60, reward: 25 },
    { label: '90 seconds (35 coins)', value: 90, reward: 35 },
    { label: '120 seconds (45 coins)', value: 120, reward: 45 },
    { label: '180 seconds (55 coins)', value: 180, reward: 55 },
    { label: '300 seconds (90 coins)', value: 300, reward: 90 },
    { label: '600 seconds (200 coins)', value: 600, reward: 200 },
  ];

  const calculateCost = () => {
    if (!selectedViews || !selectedDuration) return 0;
    return calculatePromotionCost(selectedViews, selectedDuration, profile?.is_vip);
  };

  const calculateReward = () => {
    if (!selectedDuration) return 0;
    return calculateCoinReward(selectedDuration);
  };

  const handlePromoteVideo = async () => {
    console.log('Promote video attempt:', { user, profile, youtubeUrl, title, selectedViews, selectedDuration, isVideoValid });
    
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to promote videos');
      return;
    }

    if (!profile) {
      Alert.alert('Profile Loading', 'Please wait for your profile to load');
      return;
    }

    if (!youtubeUrl || !title || !selectedViews || !selectedDuration) {
      Alert.alert('Error', 'Please fill in all fields and ensure video is valid');
      return;
    }

    if (!isVideoValid) {
      Alert.alert('Error', 'Please ensure the video URL is valid');
      return;
    }

    const cost = calculateCost();
    const reward = calculateReward();

    if (profile.coins < cost) {
      Alert.alert('Insufficient Coins', `You need ${cost} coins to promote this video. You have ${profile.coins} coins.`);
      return;
    }

    setLoading(true);
    try {
      const result = await createVideoWithHold(
        user.id,
        youtubeUrl,
        title,
        '', // description
        selectedDuration,
        cost,
        reward,
        selectedViews
      );

      if (result) {
        Alert.alert(
          'Video Promoted Successfully!',
          `Your video has been submitted for promotion. It will be available for viewers after a 10-minute hold period.`,
          [
            { text: 'OK', onPress: () => {
              // Reset form
              setYoutubeUrl('');
              setTitle('');
              setSelectedViews(null);
              setSelectedDuration(null);
              refreshProfile();
            }}
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to promote video. Please try again.');
      }
    } catch (error) {
      console.error('Error promoting video:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoValidation = (isValid: boolean, extractedTitle?: string, extractedVideoId?: string) => {
    setIsVideoValid(isValid);
    if (isValid && extractedTitle && !title) {
      setTitle(extractedTitle);
    }
    if (isValid && extractedVideoId) {
      setVideoId(extractedVideoId);
    }
  };

  return (
    <View style={styles.container}>
      <GlobalHeader 
        title="Promote" 
        showCoinDisplay={true}
        menuVisible={menuVisible} 
        setMenuVisible={setMenuVisible} 
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <Text style={styles.label}>YouTube URL *</Text>
          <View style={styles.inputContainer}>
            <Link size={20} color="#800080" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="https://youtu.be/fCtFxT3n_l0"
              placeholderTextColor="#999"
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>Video Title *</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter video title"
              placeholderTextColor="#999"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <Text style={styles.label}>Number of Views *</Text>
          <TouchableOpacity 
            style={styles.dropdown}
            onPress={() => setShowViewsDropdown(!showViewsDropdown)}
          >
            <Text style={[styles.dropdownText, !selectedViews && styles.placeholder]}>
              {selectedViews ? `${selectedViews} Views` : 'Select views'}
            </Text>
            <ChevronDown size={20} color="#666" />
          </TouchableOpacity>
          
          {showViewsDropdown && (
            <View style={styles.dropdownMenu}>
              {viewsOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedViews(option.value);
                    setShowViewsDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Set Duration (seconds) *</Text>
          <TouchableOpacity 
            style={styles.dropdown}
            onPress={() => setShowDurationDropdown(!showDurationDropdown)}
          >
            <Text style={[styles.dropdownText, !selectedDuration && styles.placeholder]}>
              {selectedDuration ? `${selectedDuration} seconds` : 'Select duration'}
            </Text>
            <ChevronDown size={20} color="#666" />
          </TouchableOpacity>
          
          {showDurationDropdown && (
            <View style={styles.dropdownMenu}>
              {durationOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedDuration(option.value);
                    setShowDurationDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedViews && selectedDuration && (
            <View style={styles.costContainer}>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>Cost</Text>
                <Text style={styles.costValue}>{calculateCost()} coins</Text>
              </View>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>Reward per view</Text>
                <Text style={styles.costValue}>{calculateReward()} coins</Text>
              </View>
              {profile?.is_vip && (
                <View style={styles.vipDiscount}>
                  <Text style={styles.vipDiscountText}>VIP 10% Discount Applied!</Text>
                </View>
              )}
            </View>
          )}
          <VideoPreview 
            youtubeUrl={youtubeUrl}
            onValidation={handleVideoValidation}
            collapsed={isVideoValid && youtubeUrl.length > 0}
          />


          <TouchableOpacity
            style={[
              styles.promoteButton, 
              (loading || !isVideoValid) && styles.buttonDisabled
            ]}
            onPress={handlePromoteVideo}
            disabled={loading || !isVideoValid}
          >
            <TrendingUp size={20} color="white" />
            <Text style={styles.promoteButtonText}>
              {loading ? 'Promoting...' : 'Promote Video'}
            </Text>
          </TouchableOpacity>

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>How it works:</Text>
            <Text style={styles.infoText}>
              1. Paste your YouTube video URL{'\n'}
              2. Your video enters a 10-minute hold period{'\n'}
              3. After the hold period, your video becomes available for viewers{'\n'}
              4. Users earn coins by watching your video{'\n'}
              5. Track your video's performance in Analytics
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  form: {
    gap: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 16,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#999',
  },
  dropdownMenu: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 300,
    zIndex: 1000,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
  costContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  costItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  costLabel: {
    fontSize: 16,
    color: '#666',
  },
  costValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#800080',
  },
  vipDiscount: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFD700',
    borderRadius: 8,
  },
  vipDiscountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#800080',
    textAlign: 'center',
  },
  promoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#800080',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  promoteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});