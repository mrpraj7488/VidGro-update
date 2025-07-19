import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Trash2, TriangleAlert as AlertTriangle, Shield } from 'lucide-react-native';

export default function DeleteAccountScreen() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      Alert.alert('Error', 'Please type "DELETE" to confirm account deletion');
      return;
    }

    setLoading(true);
    
    Alert.alert(
      'Final Confirmation',
      'This action cannot be undone. Are you absolutely sure you want to delete your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Forever', 
          style: 'destructive',
          onPress: async () => {
            // Simulate account deletion process
            setTimeout(async () => {
              Alert.alert(
                'Account Deleted',
                'Your account has been permanently deleted. Thank you for using VidGro.',
                [{ text: 'OK', onPress: async () => {
                  await signOut();
                  router.replace('/(auth)/login');
                }}]
              );
            }, 2000);
          }
        }
      ]
    );
    
    setLoading(false);
  };

  const dataToDelete = [
    'Your profile information and username',
    'All promoted videos and their analytics',
    'Coin transaction history',
    'Video viewing history',
    'VIP subscription status',
    'Referral codes and bonuses',
    'Support tickets and communications',
    'All personal preferences and settings'
  ];

  if (step === 1) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#E74C3C', '#C0392B']}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Delete Account</Text>
            <Trash2 size={24} color="white" />
          </View>
        </LinearGradient>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.warningContainer}>
            <AlertTriangle size={48} color="#E74C3C" />
            <Text style={styles.warningTitle}>Account Deletion Warning</Text>
            <Text style={styles.warningText}>
              Deleting your account is permanent and cannot be undone. Please consider the consequences carefully.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What will be deleted:</Text>
            {dataToDelete.map((item, index) => (
              <View key={index} style={styles.deleteItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.deleteText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.alternativesSection}>
            <Text style={styles.alternativesTitle}>Consider these alternatives:</Text>
            <TouchableOpacity style={styles.alternativeButton}>
              <Shield size={20} color="#2ECC71" />
              <Text style={styles.alternativeText}>Temporarily deactivate account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.alternativeButton}>
              <Shield size={20} color="#3498DB" />
              <Text style={styles.alternativeText}>Contact support for help</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => setStep(2)}
          >
            <Text style={styles.continueButtonText}>Continue with Deletion</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#E74C3C', '#C0392B']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => setStep(1)}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Deletion</Text>
          <Trash2 size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.confirmationContainer}>
          <Text style={styles.confirmationTitle}>Final Step</Text>
          <Text style={styles.confirmationText}>
            To confirm account deletion, please type "DELETE" in the box below:
          </Text>

          <TextInput
            style={styles.confirmInput}
            placeholder="Type DELETE here"
            placeholderTextColor="#999"
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
          />

          <View style={styles.accountInfo}>
            <Text style={styles.accountInfoTitle}>Account to be deleted:</Text>
            <Text style={styles.accountInfoText}>Username: {profile?.username}</Text>
            <Text style={styles.accountInfoText}>Email: {profile?.email}</Text>
            <Text style={styles.accountInfoText}>Coins: {profile?.coins}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.deleteButton,
              (loading || confirmText !== 'DELETE') && styles.buttonDisabled
            ]}
            onPress={handleDeleteAccount}
            disabled={loading || confirmText !== 'DELETE'}
          >
            <Trash2 size={20} color="white" />
            <Text style={styles.deleteButtonText}>
              {loading ? 'Deleting Account...' : 'Delete Account Forever'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel - Keep My Account</Text>
          </TouchableOpacity>
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
  warningContainer: {
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FFCDD2',
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E74C3C',
    marginTop: 16,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 16,
    color: '#C62828',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  deleteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#E74C3C',
    marginRight: 8,
    marginTop: 2,
  },
  deleteText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    lineHeight: 20,
  },
  alternativesSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  alternativesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  alternativeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  alternativeText: {
    fontSize: 16,
    color: '#333',
  },
  continueButton: {
    backgroundColor: '#E74C3C',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmationContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  confirmationTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  confirmationText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmInput: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginBottom: 24,
    textAlign: 'center',
  },
  accountInfo: {
    width: '100%',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  accountInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  accountInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E74C3C',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
});