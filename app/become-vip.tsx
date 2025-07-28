import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Crown, Check, Zap, Shield, Headphones } from 'lucide-react-native';

export default function BecomeVIPScreen() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const vipPlans = [
    {
      duration: '1 Month',
      price: 99,
      savings: 0,
      popular: false,
    },
    {
      duration: '3 Months',
      price: 249,
      savings: 48,
      popular: true,
    },
    {
      duration: '6 Months',
      price: 449,
      savings: 145,
      popular: false,
    },
    {
      duration: '1 Year',
      price: 799,
      savings: 389,
      popular: false,
    },
  ];

  const vipBenefits = [
    { icon: Zap, title: '10% Discount', description: 'On all video promotions' },
    { icon: Shield, title: 'Ad-Free Experience', description: 'No interruptions while earning' },
    { icon: Headphones, title: 'Priority Support', description: '24/7 dedicated customer support' },
    { icon: Crown, title: 'VIP Badge', description: 'Show your premium status' },
  ];

  const handleSubscribe = async (plan: any) => {
    setLoading(true);
    
    Alert.alert(
      'Subscribe to VIP',
      `Are you sure you want to subscribe to VIP for ${plan.duration} at ₹${plan.price}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Subscribe', 
          onPress: async () => {
            // Here you would integrate with actual payment service
            // For now, we'll simulate successful subscription
            
            setTimeout(() => {
              Alert.alert(
                'Welcome to VIP!',
                `You are now a VIP member for ${plan.duration}. Enjoy all the premium benefits!`,
                [{ text: 'OK', onPress: () => {
                  refreshProfile();
                  router.back();
                }}]
              );
            }, 1000);
          }
        }
      ]
    );
    
    setLoading(false);
  };

  if (profile?.is_vip) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#FFD700', '#FF4757']}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>VIP Status</Text>
            <Crown size={24} color="white" />
          </View>
        </LinearGradient>

        <View style={styles.vipActiveContainer}>
          <View style={styles.vipIcon}>
            <Crown size={48} color="#FFD700" />
          </View>
          <Text style={styles.vipActiveTitle}>You're a VIP Member!</Text>
          <Text style={styles.vipActiveSubtitle}>
            Enjoy all premium benefits including ad-free experience and 10% discount
          </Text>
          
          <View style={styles.benefitsList}>
            {vipBenefits.map((benefit, index) => (
              <View key={index} style={styles.benefitItem}>
                <benefit.icon size={20} color="#FFD700" />
                <View style={styles.benefitContent}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDescription}>{benefit.description}</Text>
                </View>
                <Check size={20} color="#2ECC71" />
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFD700', '#FF4757']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Become VIP</Text>
          <Crown size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Unlock premium features and maximize your earnings
        </Text>

        <View style={styles.benefitsContainer}>
          <Text style={styles.benefitsTitle}>VIP Benefits</Text>
          {vipBenefits.map((benefit, index) => (
            <View key={index} style={styles.benefitItem}>
              <benefit.icon size={24} color="#FFD700" />
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDescription}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plansContainer}>
          <Text style={styles.plansTitle}>Choose Your Plan</Text>
          {vipPlans.map((plan, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.planCard,
                plan.popular && styles.popularPlan
              ]}
              onPress={() => handleSubscribe(plan)}
              disabled={loading}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>MOST POPULAR</Text>
                </View>
              )}
              
              <View style={styles.planHeader}>
                <Text style={styles.planDuration}>{plan.duration}</Text>
                <View style={styles.planPricing}>
                  <Text style={styles.planPrice}>₹{plan.price}</Text>
                  {plan.savings > 0 && (
                    <Text style={styles.planSavings}>Save ₹{plan.savings}</Text>
                  )}
                </View>
              </View>

              <View style={styles.subscribeButton}>
                <Text style={styles.subscribeButtonText}>
                  {loading ? 'Processing...' : 'Subscribe'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.guaranteeContainer}>
          <Text style={styles.guaranteeTitle}>💎 Premium Guarantee</Text>
          <Text style={styles.guaranteeText}>
            Not satisfied? Cancel anytime within 7 days for a full refund
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
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  benefitsContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  benefitContent: {
    flex: 1,
    marginLeft: 16,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  benefitDescription: {
    fontSize: 14,
    color: '#666',
  },
  plansContainer: {
    marginBottom: 32,
  },
  plansTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  popularPlan: {
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.2,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 20,
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  planDuration: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  planPricing: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  planSavings: {
    fontSize: 12,
    color: '#2ECC71',
    fontWeight: '600',
  },
  subscribeButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  guaranteeContainer: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  guaranteeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2ECC71',
    marginBottom: 4,
  },
  guaranteeText: {
    fontSize: 12,
    color: '#2ECC71',
    textAlign: 'center',
  },
  vipActiveContainer: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  vipIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  vipActiveTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  vipActiveSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  benefitsList: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});