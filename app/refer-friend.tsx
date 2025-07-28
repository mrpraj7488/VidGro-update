import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Share2, Copy, Gift, Users, Coins } from 'lucide-react-native';

export default function ReferFriendScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const referralCode = profile?.referral_code || 'VIDGRO123';
  const referralLink = `https://vidgro.app/join?ref=${referralCode}`;

  const handleCopyCode = async () => {
    // In a real app, you'd use Clipboard API
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  const handleCopyLink = async () => {
    // In a real app, you'd use Clipboard API
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on VidGro and start earning coins by watching videos! Use my referral code: ${referralCode} or click: ${referralLink}`,
        title: 'Join VidGro - Watch & Earn',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const benefits = [
    {
      icon: Coins,
      title: 'You Get 500 Coins',
      description: 'Earn 500 coins for each friend who joins and completes their first video watch',
      color: '#FFD700'
    },
    {
      icon: Gift,
      title: 'Friend Gets 200 Coins',
      description: 'Your friend receives 200 bonus coins when they sign up with your code',
      color: '#2ECC71'
    },
    {
      icon: Users,
      title: 'Unlimited Referrals',
      description: 'No limit on how many friends you can refer. More friends = more coins!',
      color: '#3498DB'
    }
  ];

  const steps = [
    'Share your referral code or link with friends',
    'Friend signs up using your code',
    'Friend watches their first video',
    'You both get bonus coins instantly!'
  ];

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
          <Text style={styles.headerTitle}>Refer Friends</Text>
          <Share2 size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Users size={64} color="#800080" />
          <Text style={styles.heroTitle}>Invite Friends & Earn Together</Text>
          <Text style={styles.heroSubtitle}>
            Share VidGro with your friends and both of you earn bonus coins!
          </Text>
        </View>

        <View style={styles.benefitsSection}>
          <Text style={styles.sectionTitle}>Referral Benefits</Text>
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: `${benefit.color}20` }]}>
                <benefit.icon size={24} color={benefit.color} />
              </View>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDescription}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.codeSection}>
          <Text style={styles.sectionTitle}>Your Referral Code</Text>
          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>{referralCode}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
              <Copy size={20} color="#800080" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.linkSection}>
          <Text style={styles.sectionTitle}>Your Referral Link</Text>
          <View style={styles.linkContainer}>
            <Text style={styles.linkText} numberOfLines={1}>{referralLink}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
              <Copy size={20} color="#800080" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Share2 size={20} color="white" />
          <Text style={styles.shareButtonText}>Share with Friends</Text>
        </TouchableOpacity>

        <View style={styles.stepsSection}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          {steps.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Referral Stats</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Friends Referred</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Coins Earned</Text>
            </View>
          </View>
        </View>

        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            • Referral bonus is awarded when referred friend completes first video watch{'\n'}
            • Each user can only be referred once{'\n'}
            • Referral rewards may take up to 24 hours to process{'\n'}
            • VidGro reserves the right to modify referral terms at any time{'\n'}
            • Fraudulent referrals will result in account suspension
          </Text>
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
  heroSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  benefitsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  benefitCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  codeSection: {
    marginBottom: 24,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  codeText: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#800080',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
  },
  linkSection: {
    marginBottom: 24,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  shareButton: {
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
  shareButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#800080',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  statsSection: {
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#800080',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  termsSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  termsText: {
    fontSize: 12,
    color: '#BF360C',
    lineHeight: 18,
  },
});