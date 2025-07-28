import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Globe, Check } from 'lucide-react-native';

export default function LanguagesScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [loading, setLoading] = useState(false);

  const languages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  ];

  const handleLanguageChange = async (languageCode: string) => {
    setSelectedLanguage(languageCode);
    setLoading(true);

    // Simulate language change
    setTimeout(() => {
      Alert.alert(
        'Language Changed',
        `Language has been changed to ${languages.find(l => l.code === languageCode)?.name}. The app will restart to apply changes.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
      setLoading(false);
    }, 1000);
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
          <Text style={styles.headerTitle}>Languages</Text>
          <Globe size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Choose your preferred language for the app interface
        </Text>

        <View style={styles.languagesContainer}>
          {languages.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={[
                styles.languageCard,
                selectedLanguage === language.code && styles.selectedLanguage
              ]}
              onPress={() => handleLanguageChange(language.code)}
              disabled={loading}
            >
              <View style={styles.languageInfo}>
                <Text style={styles.flag}>{language.flag}</Text>
                <View style={styles.languageText}>
                  <Text style={[
                    styles.languageName,
                    selectedLanguage === language.code && styles.selectedText
                  ]}>
                    {language.name}
                  </Text>
                  <Text style={[
                    styles.nativeName,
                    selectedLanguage === language.code && styles.selectedNativeText
                  ]}>
                    {language.nativeName}
                  </Text>
                </View>
              </View>
              {selectedLanguage === language.code && (
                <Check size={20} color="#800080" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Language Support</Text>
          <Text style={styles.infoText}>
            • All interface elements will be translated{'\n'}
            • Video titles and descriptions remain in original language{'\n'}
            • Support messages will be in your selected language{'\n'}
            • App restart may be required for full language change
          </Text>
        </View>

        <View style={styles.noteContainer}>
          <Text style={styles.noteTitle}>📝 Note</Text>
          <Text style={styles.noteText}>
            Some languages are still being translated. If you notice any missing translations, please contact our support team.
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
  languagesContainer: {
    gap: 12,
    marginBottom: 32,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  selectedLanguage: {
    borderColor: '#800080',
    backgroundColor: '#F3E5F5',
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flag: {
    fontSize: 24,
    marginRight: 16,
  },
  languageText: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectedText: {
    color: '#800080',
  },
  nativeName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectedNativeText: {
    color: '#800080',
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
  noteContainer: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#BF360C',
    lineHeight: 20,
  },
});