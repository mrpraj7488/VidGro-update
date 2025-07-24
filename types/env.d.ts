declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: string;
      EXPO_PUBLIC_ADMOB_APP_ID: string;
      EXPO_PUBLIC_ADMOB_BANNER_ID: string;
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID: string;
      EXPO_PUBLIC_ADMOB_REWARDED_ID: string;
    }
  }
}

export {};