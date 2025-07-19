import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Menu, X, User, Share2, Shield, FileText, Globe, Settings, MessageCircle, LogOut, Trash2 } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';

interface GlobalHeaderProps {
  title: string;
  showCoinDisplay?: boolean;
  menuVisible: boolean;
  setMenuVisible: (visible: boolean) => void;
}

export default function GlobalHeader({ 
  title, 
  showCoinDisplay = true,
  menuVisible, 
  setMenuVisible 
}: GlobalHeaderProps) {
  const { profile, signOut } = useAuth();
  const router = useRouter();

  console.log('GlobalHeader profile:', profile); // Debug log

  const sideMenuItems = [
    { icon: Share2, title: 'Refer a Friend', route: '/refer-friend' },
    { icon: Shield, title: 'Privacy Policy', route: '/privacy-policy' },
    { icon: FileText, title: 'Terms of Service', route: '/terms' },
    { icon: Globe, title: 'Languages', route: '/languages' },
    { icon: Settings, title: 'Configure Ads', route: '/configure-ads' },
    { icon: MessageCircle, title: 'Contact Support', route: '/contact-support' },
    { icon: LogOut, title: 'Log Out', action: 'logout', color: '#E74C3C' },
    { icon: Trash2, title: 'Delete Account', route: '/delete-account', color: '#E74C3C' },
  ];

  const handleItemPress = async (item: any) => {
    if (item.action === 'logout') {
      await handleLogout();
    } else if (item.route) {
      router.push(item.route);
      setMenuVisible(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    console.log('GlobalHeader: Logout initiated');
    setMenuVisible(false);
    
    try {
      console.log('GlobalHeader: Calling signOut function');
      await signOut();
      console.log('GlobalHeader: SignOut completed, navigating to login');
    } catch (error) {
      console.error('GlobalHeader: Logout error:', error);
    }
    
    // Always navigate to login after signOut attempt
    router.replace('/(auth)/login');
  };

  const renderSideMenu = () => (
    <View style={[styles.sideMenu, { left: menuVisible ? 0 : -300 }]}>
      <View style={styles.sideMenuHeader}>
        <View style={styles.profileSection}>
          <View style={styles.profileAvatar}>
            <User size={32} color="white" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.username || 'User'}</Text>
            <Text style={styles.profileEmail}>{profile?.email || 'user@example.com'}</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => setMenuVisible(false)}
        >
          <X size={24} color="white" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.sideMenuContent}>
        {sideMenuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.sideMenuItem}
            onPress={() => handleItemPress(item)}
          >
            <item.icon size={20} color={item.color || '#800080'} />
            <Text style={[styles.sideMenuText, item.color && { color: item.color }]}>
              {item.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <TouchableOpacity 
            style={styles.menuButton}
            onPress={() => setMenuVisible(!menuVisible)}
          >
            {menuVisible ? (
              <X size={24} color="white" />
            ) : (
              <Menu size={24} color="white" />
            )}
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
        </View>
        
        {showCoinDisplay && profile && (
          <View style={styles.coinDisplay}>
            <View style={styles.coinBadge}>
              <Text style={styles.coinIcon}>🪙</Text>
              <Text style={styles.coinText}>{profile.coins.toLocaleString()}</Text>
            </View>
          </View>
        )}
      </View>
      
      {renderSideMenu()}
      
      {menuVisible && (
        <TouchableOpacity 
          style={styles.overlay}
          onPress={() => setMenuVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#800080',
    paddingTop: 50,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  coinDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  coinIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  coinText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sideMenu: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: 'white',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sideMenuHeader: {
    backgroundColor: '#800080',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  profileEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  closeButton: {
    padding: 8,
  },
  sideMenuContent: {
    flex: 1,
  },
  sideMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sideMenuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
});