import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { supabase, getBalanceSystemMetrics } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChartBar as BarChart3, Database, Zap, TrendingUp, RefreshCw } from 'lucide-react-native';

interface BalanceMetrics {
  old_system_size_bytes: number;
  new_system_size_bytes: number;
  storage_reduction_percent: number;
  total_users: number;
  total_transactions: number;
  avg_transactions_per_user: number;
  performance_improvement: string;
}

export default function BalanceSystemMonitor() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<BalanceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      fetchMetrics();
    }
  }, [user]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const data = await getBalanceSystemMetrics();
      if (data) {
        setMetrics(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching balance metrics:', error);
      Alert.alert('Error', 'Failed to load system metrics');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPerformanceColor = (improvement: string): string => {
    switch (improvement) {
      case 'SIGNIFICANT': return '#2ECC71';
      case 'MODERATE': return '#F39C12';
      case 'MINIMAL': return '#E74C3C';
      default: return '#95A5A6';
    }
  };

  if (!metrics) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Database size={24} color="#800080" />
          <Text style={styles.title}>Balance System Monitor</Text>
          <TouchableOpacity onPress={fetchMetrics} disabled={loading}>
            <RefreshCw size={20} color={loading ? "#CCC" : "#800080"} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {loading ? 'Loading metrics...' : 'Tap refresh to load metrics'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Database size={24} color="#800080" />
        <Text style={styles.title}>Balance System Monitor</Text>
        <TouchableOpacity onPress={fetchMetrics} disabled={loading}>
          <RefreshCw size={20} color={loading ? "#CCC" : "#800080"} />
        </TouchableOpacity>
      </View>

      {/* Storage Optimization */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <BarChart3 size={20} color="#2ECC71" />
          <Text style={styles.sectionTitle}>Storage Optimization</Text>
        </View>
        
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Old System Size</Text>
            <Text style={styles.metricValue}>
              {formatBytes(metrics.old_system_size_bytes)}
            </Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>New System Size</Text>
            <Text style={styles.metricValue}>
              {formatBytes(metrics.new_system_size_bytes)}
            </Text>
          </View>
        </View>

        <View style={styles.reductionCard}>
          <Text style={styles.reductionLabel}>Storage Reduction</Text>
          <Text style={styles.reductionValue}>
            {metrics.storage_reduction_percent.toFixed(1)}%
          </Text>
          <Text style={styles.reductionSavings}>
            Saved: {formatBytes(metrics.old_system_size_bytes - metrics.new_system_size_bytes)}
          </Text>
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Zap size={20} color="#F39C12" />
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
        </View>
        
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Users</Text>
            <Text style={styles.metricValue}>
              {metrics.total_users.toLocaleString()}
            </Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Transactions</Text>
            <Text style={styles.metricValue}>
              {metrics.total_transactions.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.performanceCard}>
          <Text style={styles.performanceLabel}>Avg Transactions/User</Text>
          <Text style={styles.performanceValue}>
            {metrics.avg_transactions_per_user.toFixed(1)}
          </Text>
          <View style={[
            styles.performanceBadge, 
            { backgroundColor: getPerformanceColor(metrics.performance_improvement) }
          ]}>
            <Text style={styles.performanceBadgeText}>
              {metrics.performance_improvement} IMPROVEMENT
            </Text>
          </View>
        </View>
      </View>

      {/* System Benefits */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <TrendingUp size={20} color="#3498DB" />
          <Text style={styles.sectionTitle}>System Benefits</Text>
        </View>
        
        <View style={styles.benefitsList}>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>⚡</Text>
            <Text style={styles.benefitText}>O(1) balance lookups instead of aggregation queries</Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🔒</Text>
            <Text style={styles.benefitText}>Optimistic locking prevents race conditions</Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>💾</Text>
            <Text style={styles.benefitText}>
              {metrics.storage_reduction_percent.toFixed(0)}% reduction in storage usage
            </Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🚀</Text>
            <Text style={styles.benefitText}>Atomic balance updates with rollback capability</Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>📊</Text>
            <Text style={styles.benefitText}>Lightweight audit trail for transaction history</Text>
          </View>
        </View>
      </View>

      {lastUpdated && (
        <View style={styles.footer}>
          <Text style={styles.lastUpdatedText}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  reductionCard: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#2ECC71',
  },
  reductionLabel: {
    fontSize: 14,
    color: '#2ECC71',
    marginBottom: 8,
    fontWeight: '600',
  },
  reductionValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2ECC71',
    marginBottom: 4,
  },
  reductionSavings: {
    fontSize: 12,
    color: '#27AE60',
  },
  performanceCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F39C12',
  },
  performanceLabel: {
    fontSize: 14,
    color: '#F39C12',
    marginBottom: 8,
    fontWeight: '600',
  },
  performanceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F39C12',
    marginBottom: 12,
  },
  performanceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  performanceBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    fontSize: 20,
    width: 32,
    textAlign: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#999',
  },
});