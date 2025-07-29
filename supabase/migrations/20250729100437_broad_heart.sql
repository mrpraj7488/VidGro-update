-- VidGro Complete Database Setup - Apply Schema
-- This migration creates the complete database structure

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  coins INTEGER DEFAULT 100 NOT NULL CHECK (coins >= 0),
  is_vip BOOLEAN DEFAULT FALSE,
  vip_expires_at TIMESTAMPTZ,
  referral_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'base64'),
  referred_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create videos table with all required columns
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL, -- This stores the video ID, not full URL
  title TEXT NOT NULL,
  views_count INTEGER DEFAULT 0 NOT NULL CHECK (views_count >= 0),
  target_views INTEGER NOT NULL CHECK (target_views > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  coin_reward INTEGER NOT NULL CHECK (coin_reward > 0),
  coin_cost INTEGER NOT NULL CHECK (coin_cost > 0),
  status TEXT DEFAULT 'on_hold' CHECK (status IN ('active', 'paused', 'completed', 'on_hold', 'repromoted')),
  hold_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  repromoted_at TIMESTAMPTZ,
  total_watch_time INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0.0,
  completion_rate DECIMAL(5,2) DEFAULT 0.0,
  average_watch_time DECIMAL(8,2) DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create coin_transactions table with engagement tracking
CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'video_watch', 'video_promotion', 'purchase', 'referral_bonus', 
    'admin_adjustment', 'vip_purchase', 'video_deletion_refund', 'ad_stop_purchase'
  )),
  description TEXT,
  reference_id UUID, -- Can reference videos.id or other entities
  view_count INTEGER DEFAULT 1,
  engagement_duration INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '60 seconds'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video_views table for tracking user video interactions
CREATE TABLE IF NOT EXISTS video_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  watched_duration INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  coins_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, viewer_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_status_views ON videos(status, views_count, target_views);
CREATE INDEX IF NOT EXISTS idx_videos_hold_until ON videos(hold_until) WHERE status = 'on_hold';
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_type ON coin_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_reference ON coin_transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_transactions_expires_at ON coin_transactions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_transactions_video_watch ON coin_transactions(reference_id, user_id, engagement_duration, created_at) WHERE transaction_type = 'video_watch';

CREATE INDEX IF NOT EXISTS idx_video_views_video_id ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_viewer_id ON video_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_video_views_unique ON video_views(video_id, viewer_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Profiles policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Videos policies
DROP POLICY IF EXISTS "Users can read all videos" ON videos;
CREATE POLICY "Users can read all videos" ON videos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own videos" ON videos;
CREATE POLICY "Users can insert own videos" ON videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own videos" ON videos;
CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own videos" ON videos;
CREATE POLICY "Users can delete own videos" ON videos
  FOR DELETE USING (auth.uid() = user_id);

-- Coin transactions policies
DROP POLICY IF EXISTS "Users can read own transactions" ON coin_transactions;
CREATE POLICY "Users can read own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON coin_transactions;
CREATE POLICY "Users can insert own transactions" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Video views policies
DROP POLICY IF EXISTS "Users can read own video views" ON video_views;
CREATE POLICY "Users can read own video views" ON video_views
  FOR SELECT USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can insert own video views" ON video_views;
CREATE POLICY "Users can insert own video views" ON video_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can update own video views" ON video_views;
CREATE POLICY "Users can update own video views" ON video_views
  FOR UPDATE USING (auth.uid() = viewer_id);

-- Function to handle user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Also grant to anon for public access where needed
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON videos TO anon;