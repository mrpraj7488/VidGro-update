import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface SubscriptionConfig {
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
}

export function useRealtimeSubscription(
  config: SubscriptionConfig,
  callback: (payload: any) => void,
  dependencies: any[] = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const { table, filter, event = '*', schema = 'public' } = config;
    
    // Create unique channel name
    const channelName = `${table}_${filter || 'all'}_${Date.now()}`;
    
    // Create subscription
    const channel = supabase.channel(channelName);
    
    const subscriptionConfig: any = {
      event,
      schema,
      table,
    };
    
    if (filter) {
      subscriptionConfig.filter = filter;
    }
    
    channel
      .on('postgres_changes', subscriptionConfig, callback)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Subscribed to ${table} changes`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Error subscribing to ${table} changes`);
        }
      });
    
    channelRef.current = channel;
    
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [config.table, config.filter, config.event, config.schema, ...dependencies]);

  return channelRef.current;
}

export function useProfileSubscription(userId: string | undefined, callback: (payload: any) => void) {
  return useRealtimeSubscription(
    {
      table: 'profiles',
      filter: userId ? `id=eq.${userId}` : undefined,
      event: 'UPDATE',
    },
    callback,
    [userId]
  );
}

export function useVideoQueueSubscription(callback: (payload: any) => void) {
  return useRealtimeSubscription(
    {
      table: 'videos',
      event: '*',
    },
    callback
  );
}

export function useCoinTransactionSubscription(userId: string | undefined, callback: (payload: any) => void) {
  return useRealtimeSubscription(
    {
      table: 'coin_transactions',
      filter: userId ? `user_id=eq.${userId}` : undefined,
      event: 'INSERT',
    },
    callback,
    [userId]
  );
}