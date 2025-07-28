import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Shield, Eye, Lock, Database } from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  const sections = [
    {
      title: 'Information We Collect',
      icon: Database,
      content: `We collect information you provide directly to us, such as when you create an account, promote videos, or contact us for support.

This includes:
• Account information (email, username)
• Video promotion data (YouTube URLs, titles)
• Transaction history and coin balance
• Device information and usage analytics
• Communication records with support`
    },
    {
      title: 'How We Use Your Information',
      icon: Eye,
      content: `We use the information we collect to:

• Provide and maintain our services
• Process video promotions and coin transactions
• Send you technical notices and support messages
• Analyze usage patterns to improve our platform
• Prevent fraud and ensure platform security
• Comply with legal obligations`
    },
    {
      title: 'Information Sharing',
      icon: Shield,
      content: `We do not sell, trade, or rent your personal information to third parties.

We may share your information only in these limited circumstances:
• With your explicit consent
• To comply with legal requirements
• To protect our rights and prevent fraud
• With service providers who assist in platform operations
• In connection with a business transfer or merger`
    },
    {
      title: 'Data Security',
      icon: Lock,
      content: `We implement appropriate security measures to protect your information:

• Encryption of data in transit and at rest
• Regular security audits and monitoring
• Access controls and authentication systems
• Secure data centers and infrastructure
• Employee training on data protection

However, no method of transmission over the internet is 100% secure.`
    }
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
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <Shield size={24} color="white" />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>Your Privacy Matters</Text>
          <Text style={styles.introText}>
            At VidGro, we are committed to protecting your privacy and ensuring the security of your personal information. This policy explains how we collect, use, and safeguard your data.
          </Text>
          <Text style={styles.lastUpdated}>Last updated: January 15, 2025</Text>
        </View>

        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <View style={styles.sectionHeader}>
              <section.icon size={24} color="#800080" />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={24} color="#800080" />
            <Text style={styles.sectionTitle}>Your Rights</Text>
          </View>
          <Text style={styles.sectionContent}>
            You have the right to:
            {'\n\n'}• Access your personal information
            {'\n'}• Correct inaccurate data
            {'\n'}• Delete your account and data
            {'\n'}• Export your data
            {'\n'}• Opt out of marketing communications
            {'\n'}• File a complaint with data protection authorities
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Database size={24} color="#800080" />
            <Text style={styles.sectionTitle}>Data Retention</Text>
          </View>
          <Text style={styles.sectionContent}>
            We retain your information for as long as your account is active or as needed to provide services. When you delete your account, we will delete your personal information within 30 days, except where we are required to retain it for legal purposes.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Eye size={24} color="#800080" />
            <Text style={styles.sectionTitle}>Cookies and Tracking</Text>
          </View>
          <Text style={styles.sectionContent}>
            We use cookies and similar technologies to:
            {'\n\n'}• Remember your preferences
            {'\n'}• Analyze platform usage
            {'\n'}• Improve user experience
            {'\n'}• Prevent fraud and abuse
            {'\n\n'}You can control cookie settings through your browser preferences.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Lock size={24} color="#800080" />
            <Text style={styles.sectionTitle}>Children's Privacy</Text>
          </View>
          <Text style={styles.sectionContent}>
            Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
          </Text>
        </View>

        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Contact Us</Text>
          <Text style={styles.contactText}>
            If you have any questions about this Privacy Policy, please contact us:
            {'\n\n'}Email: privacy@vidgro.com
            {'\n'}Address: 123 Privacy Street, Data City, DC 12345
            {'\n'}Phone: +1 (555) 123-4567
          </Text>
        </View>

        <View style={styles.changesSection}>
          <Text style={styles.changesTitle}>Changes to This Policy</Text>
          <Text style={styles.changesText}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
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
  introSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  introText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  section: {
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  contactSection: {
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 12,
  },
  contactText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 22,
  },
  changesSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  changesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F57C00',
    marginBottom: 12,
  },
  changesText: {
    fontSize: 14,
    color: '#E65100',
    lineHeight: 22,
  },
});