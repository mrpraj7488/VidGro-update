import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Coins, Crown } from 'lucide-react-native';

export default function BuyCoinsScreen() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const coinPackages = [
    { coins: 1000, price: 29, bonus: 0, popular: false },
    { coins: 2500, price: 69, bonus: 500, popular: false },
    { coins: 5000, price: 129, bonus: 1000, popular: true },
    { coins: 10000, price: 249, bonus: 2500, popular: false },
    { coins: 25000, price: 499, bonus: 7500, popular: false },
    { coins: 50000, price: 899, bonus: 20000, popular: false },
  ];

  const handlePurchase = async (packageItem: any) => {
    setLoading(true);
    
    // Simulate purchase process
    Alert.alert(
      'Purchase Confirmation',
      `Are you sure you want to purchase ${packageItem.coins}${packageItem.bonus > 0 ? ` + ${packageItem.bonus} bonus` : ''} coins for ₹${packageItem.price}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Purchase', 
          onPress: async () => {
            // Here you would integrate with actual payment service
            // For now, we'll simulate successful purchase
            
            setTimeout(() => {
              Alert.alert(
                'Purchase Successful!',
                `${packageItem.coins + packageItem.bonus} coins have been added to your account.`,
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
          <Text style={styles.headerTitle}>Buy Coins</Text>
          <View style={styles.currentBalance}>
            <Coins size={16} color="white" />
            <Text style={styles.balanceText}>{profile?.coins || 0}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Choose a coin package to unlock more video promotions
        </Text>

        <View style={styles.packagesContainer}>
          {coinPackages.map((packageItem, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.packageCard,
                packageItem.popular && styles.popularPackage
              ]}
              onPress={() => handlePurchase(packageItem)}
              disabled={loading}
            >
              {packageItem.popular && (
                <View style={styles.popularBadge}>
                  <Crown size={16} color="white" />
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              
              <View style={styles.packageHeader}>
                <Text style={styles.coinAmount}>
                  {packageItem.coins.toLocaleString()} Coins
                </Text>
                {packageItem.bonus > 0 && (
                  <Text style={styles.bonusText}>
                    +{packageItem.bonus.toLocaleString()} Bonus
                  </Text>
                )}
              </View>

              <View style={styles.packageDetails}>
                <Text style={styles.totalCoins}>
                  Total: {(packageItem.coins + packageItem.bonus).toLocaleString()} Coins
                </Text>
                <Text style={styles.price}>₹{packageItem.price}</Text>
              </View>

              <View style={styles.purchaseButton}>
                <Text style={styles.purchaseButtonText}>
                  {loading ? 'Processing...' : 'Purchase'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Why Buy Coins?</Text>
          <Text style={styles.infoText}>
            • Promote your YouTube videos to thousands of viewers{'\n'}
            • Increase your video views and engagement{'\n'}
            • Grow your channel faster with targeted promotion{'\n'}
            • No subscription fees - pay only for what you use
          </Text>
        </View>

        <View style={styles.securityContainer}>
          <Text style={styles.securityTitle}>🔒 Secure Payment</Text>
          <Text style={styles.securityText}>
            Your payment information is protected with bank-level security
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
  currentBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  balanceText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
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
  packagesContainer: {
    gap: 16,
    marginBottom: 32,
  },
  packageCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  popularPackage: {
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  popularText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  packageHeader: {
    marginBottom: 12,
  },
  coinAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  bonusText: {
    fontSize: 14,
    color: '#2ECC71',
    fontWeight: '600',
  },
  packageDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalCoins: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#800080',
  },
  purchaseButton: {
    backgroundColor: '#800080',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
  securityContainer: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2ECC71',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 12,
    color: '#2ECC71',
    textAlign: 'center',
  },
});