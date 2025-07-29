-- VidGro Complete Database Setup - Fresh Start
-- This script creates the entire database structure from scratch

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables if they exist (in correct order to handle dependencies)
DROP TABLE IF EXISTS video_views CASCADE;
DROP TABLE IF EXISTS coin_transactions CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS get_next_video_queue_enhanced(UUID);
DROP FUNCTION IF EXISTS get_next_video_queue_simple(UUID);
DROP FUNCTION IF EXISTS award_coins_with_engagement_tracking(UUID, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS award_coins_simple_no_filters(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS create_video_simple(INTEGER, INTEGER, INTEGER, INTEGER, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS delete_video_optimized(UUID, UUID);
DROP FUNCTION IF EXISTS update_user_balance_atomic(UUID, INTEGER, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS get_user_analytics_summary_fixed(UUID);
DROP FUNCTION IF EXISTS check_and_update_expired_holds();
DROP FUNCTION IF EXISTS cleanup_expired_transactions();
DROP FUNCTION IF EXISTS get_video_engagement_analytics(UUID);
DROP FUNCTION IF EXISTS check_promotion_queue_eligibility(UUID);

-- Create profiles table
CREATE TABLE profiles (
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
CREATE TABLE videos (
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
CREATE TABLE coin_transactions (
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
CREATE TABLE video_views (
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
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_referral_code ON profiles(referral_code);

CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_status_views ON videos(status, views_count, target_views);
CREATE INDEX idx_videos_hold_until ON videos(hold_until) WHERE status = 'on_hold';
CREATE INDEX idx_videos_created_at ON videos(created_at);

CREATE INDEX idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX idx_coin_transactions_type ON coin_transactions(transaction_type);
CREATE INDEX idx_coin_transactions_reference ON coin_transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_coin_transactions_expires_at ON coin_transactions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_coin_transactions_video_watch ON coin_transactions(reference_id, user_id, engagement_duration, created_at) WHERE transaction_type = 'video_watch';

CREATE INDEX idx_video_views_video_id ON video_views(video_id);
CREATE INDEX idx_video_views_viewer_id ON video_views(viewer_id);
CREATE INDEX idx_video_views_unique ON video_views(video_id, viewer_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Profiles policies
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Videos policies
CREATE POLICY "Users can read all videos" ON videos
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own videos" ON videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos" ON videos
  FOR DELETE USING (auth.uid() = user_id);

-- Coin transactions policies
CREATE POLICY "Users can read own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Video views policies
CREATE POLICY "Users can read own video views" ON video_views
  FOR SELECT USING (auth.uid() = viewer_id);

CREATE POLICY "Users can insert own video views" ON video_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can update own video views" ON video_views
  FOR UPDATE USING (auth.uid() = viewer_id);

-- Create trigger function to update video engagement metrics
CREATE OR REPLACE FUNCTION update_video_engagement_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process video_watch transactions
  IF NEW.transaction_type = 'video_watch' AND NEW.reference_id IS NOT NULL THEN
    -- Update videos table with aggregated engagement data
    UPDATE videos 
    SET 
      total_watch_time = COALESCE((
        SELECT SUM(engagement_duration) 
        FROM coin_transactions 
        WHERE reference_id = NEW.reference_id 
        AND transaction_type = 'video_watch'
      ), 0),
      average_watch_time = COALESCE((
        SELECT AVG(engagement_duration::decimal) 
        FROM coin_transactions 
        WHERE reference_id = NEW.reference_id 
        AND transaction_type = 'video_watch'
      ), 0),
      engagement_rate = CASE 
        WHEN duration_seconds > 0 THEN 
          LEAST(100.0, (
            COALESCE((
              SELECT AVG(engagement_duration::decimal) 
              FROM coin_transactions 
              WHERE reference_id = NEW.reference_id 
              AND transaction_type = 'video_watch'
            ), 0) / duration_seconds
          ) * 100)
        ELSE 0.0
      END,
      completion_rate = CASE 
        WHEN target_views > 0 THEN 
          LEAST(100.0, (views_count::decimal / target_views) * 100)
        ELSE 0.0
      END,
      updated_at = NOW()
    WHERE id = NEW.reference_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for real-time engagement updates
CREATE TRIGGER trigger_update_video_engagement
  AFTER INSERT ON coin_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_video_engagement_metrics();

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
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to get enhanced video queue (excludes user's own videos and already watched)
CREATE OR REPLACE FUNCTION get_next_video_queue_enhanced(user_uuid UUID)
RETURNS TABLE(
  video_id UUID,
  youtube_url TEXT,
  title TEXT,
  duration_seconds INTEGER,
  coin_reward INTEGER,
  views_count INTEGER,
  target_views INTEGER,
  status TEXT,
  user_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id as video_id,
    v.youtube_url,
    v.title,
    v.duration_seconds,
    v.coin_reward,
    v.views_count,
    v.target_views,
    v.status,
    v.user_id
  FROM videos v
  WHERE (
    v.status IN ('active', 'repromoted') OR 
    (v.status = 'on_hold' AND v.hold_until <= NOW())
  )
  AND v.user_id != user_uuid  -- Exclude user's own videos
  AND v.views_count < v.target_views
  AND NOT EXISTS (
    -- Exclude videos already watched by this user
    SELECT 1 FROM video_views vv 
    WHERE vv.video_id = v.id 
    AND vv.viewer_id = user_uuid
  )
  ORDER BY 
    CASE WHEN v.status = 'repromoted' THEN 0 
         WHEN v.status = 'active' THEN 1 
         ELSE 2 END,
    v.created_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Function to get simple video queue (allows rewatching)
CREATE OR REPLACE FUNCTION get_next_video_queue_simple(user_uuid UUID)
RETURNS TABLE(
  video_id UUID,
  youtube_url TEXT,
  title TEXT,
  duration_seconds INTEGER,
  coin_reward INTEGER,
  views_count INTEGER,
  target_views INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id as video_id,
    v.youtube_url,
    v.title,
    v.duration_seconds,
    v.coin_reward,
    v.views_count,
    v.target_views,
    v.status
  FROM videos v
  WHERE (
    v.status IN ('active', 'repromoted') OR 
    (v.status = 'on_hold' AND v.hold_until <= NOW())
  )
  AND v.user_id != user_uuid  -- Exclude user's own videos
  AND v.views_count < v.target_views
  ORDER BY 
    CASE WHEN v.status = 'repromoted' THEN 0 
         WHEN v.status = 'active' THEN 1 
         ELSE 2 END,
    v.created_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Function to award coins with engagement tracking
CREATE OR REPLACE FUNCTION award_coins_with_engagement_tracking(
  user_uuid UUID,
  video_uuid UUID,
  watch_duration INTEGER,
  engagement_duration INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  video_record RECORD;
  user_record RECORD;
  coins_to_award INTEGER;
  new_balance INTEGER;
  transaction_id UUID;
  actual_engagement INTEGER;
BEGIN
  -- Get video details
  SELECT * INTO video_record
  FROM videos 
  WHERE id = video_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Video not found'
    );
  END IF;
  
  -- Get user profile
  SELECT * INTO user_record
  FROM profiles 
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Calculate engagement duration (use provided or default to watch_duration)
  actual_engagement := COALESCE(engagement_duration, watch_duration);
  
  -- Determine coins to award based on watch completion
  IF watch_duration >= video_record.duration_seconds THEN
    coins_to_award := video_record.coin_reward;
  ELSE
    -- Partial reward based on watch percentage
    coins_to_award := GREATEST(1, (video_record.coin_reward * watch_duration / video_record.duration_seconds));
  END IF;
  
  -- Update user balance
  UPDATE profiles 
  SET coins = coins + coins_to_award, updated_at = NOW()
  WHERE id = user_uuid;
  
  -- Get new balance
  SELECT coins INTO new_balance FROM profiles WHERE id = user_uuid;
  
  -- Create transaction record with engagement tracking
  INSERT INTO coin_transactions (
    user_id, 
    amount, 
    transaction_type, 
    description, 
    reference_id,
    view_count,
    engagement_duration,
    expires_at
  ) VALUES (
    user_uuid,
    coins_to_award,
    'video_watch',
    'Watched video: ' || video_record.title,
    video_uuid,
    1,
    actual_engagement,
    NOW() + INTERVAL '60 seconds'
  ) RETURNING id INTO transaction_id;
  
  -- Update video view count
  UPDATE videos 
  SET views_count = views_count + 1, updated_at = NOW()
  WHERE id = video_uuid;
  
  -- Insert or update video_views record
  INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
  VALUES (video_uuid, user_uuid, watch_duration, watch_duration >= video_record.duration_seconds, coins_to_award)
  ON CONFLICT (video_id, viewer_id) 
  DO UPDATE SET 
    watched_duration = GREATEST(video_views.watched_duration, EXCLUDED.watched_duration),
    completed = video_views.completed OR EXCLUDED.completed,
    coins_earned = video_views.coins_earned + EXCLUDED.coins_earned;
  
  RETURN json_build_object(
    'success', true,
    'coins_awarded', coins_to_award,
    'new_balance', new_balance,
    'engagement_duration', actual_engagement,
    'transaction_id', transaction_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create a new video promotion
CREATE OR REPLACE FUNCTION create_video_simple(
  coin_cost_param INTEGER,
  coin_reward_param INTEGER,
  duration_seconds_param INTEGER,
  target_views_param INTEGER,
  title_param TEXT,
  user_uuid UUID,
  youtube_url_param TEXT
)
RETURNS JSON AS $$
DECLARE
  user_record RECORD;
  new_video_id UUID;
  new_balance INTEGER;
BEGIN
  -- Get user profile
  SELECT * INTO user_record FROM profiles WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if user has enough coins
  IF user_record.coins < coin_cost_param THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient coins',
      'required', coin_cost_param,
      'available', user_record.coins
    );
  END IF;
  
  -- Deduct coins from user
  UPDATE profiles 
  SET coins = coins - coin_cost_param, updated_at = NOW()
  WHERE id = user_uuid;
  
  -- Get new balance
  SELECT coins INTO new_balance FROM profiles WHERE id = user_uuid;
  
  -- Create video record
  INSERT INTO videos (
    user_id,
    youtube_url,
    title,
    target_views,
    duration_seconds,
    coin_reward,
    coin_cost,
    status,
    hold_until
  ) VALUES (
    user_uuid,
    youtube_url_param,
    title_param,
    target_views_param,
    duration_seconds_param,
    coin_reward_param,
    coin_cost_param,
    'on_hold',
    NOW() + INTERVAL '10 minutes'
  ) RETURNING id INTO new_video_id;
  
  -- Create transaction record
  INSERT INTO coin_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    reference_id
  ) VALUES (
    user_uuid,
    -coin_cost_param,
    'video_promotion',
    'Promoted video: ' || title_param,
    new_video_id
  );
  
  RETURN json_build_object(
    'success', true,
    'video_id', new_video_id,
    'new_balance', new_balance,
    'message', 'Video created successfully and will be active after 10-minute hold period'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to delete video with refund
CREATE OR REPLACE FUNCTION delete_video_optimized(
  video_uuid UUID,
  user_uuid UUID
)
RETURNS JSON AS $$
DECLARE
  video_record RECORD;
  minutes_since_creation INTEGER;
  refund_percentage INTEGER;
  refund_amount INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get video details
  SELECT * INTO video_record
  FROM videos 
  WHERE id = video_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Video not found or not owned by user'
    );
  END IF;
  
  -- Calculate minutes since creation
  minutes_since_creation := EXTRACT(EPOCH FROM (NOW() - video_record.created_at)) / 60;
  
  -- Determine refund percentage
  IF minutes_since_creation <= 10 THEN
    refund_percentage := 100;
  ELSE
    refund_percentage := 80;
  END IF;
  
  refund_amount := (video_record.coin_cost * refund_percentage) / 100;
  
  -- Update user balance
  UPDATE profiles 
  SET coins = coins + refund_amount, updated_at = NOW()
  WHERE id = user_uuid;
  
  -- Get new balance
  SELECT coins INTO new_balance FROM profiles WHERE id = user_uuid;
  
  -- Create refund transaction
  INSERT INTO coin_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    reference_id
  ) VALUES (
    user_uuid,
    refund_amount,
    'video_deletion_refund',
    'Refund for deleted video: ' || video_record.title || ' (' || refund_percentage || '% refund)',
    video_uuid
  );
  
  -- Delete related records
  DELETE FROM video_views WHERE video_id = video_uuid;
  DELETE FROM coin_transactions WHERE reference_id = video_uuid AND transaction_type = 'video_watch';
  DELETE FROM videos WHERE id = video_uuid;
  
  RETURN json_build_object(
    'success', true,
    'refund_amount', refund_amount,
    'refund_percentage', refund_percentage,
    'new_balance', new_balance,
    'message', 'Video deleted successfully with ' || refund_percentage || '% refund'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update user balance atomically
CREATE OR REPLACE FUNCTION update_user_balance_atomic(
  user_uuid UUID,
  coin_amount INTEGER,
  transaction_type_param TEXT,
  description_param TEXT,
  reference_uuid UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  user_record RECORD;
  new_balance INTEGER;
BEGIN
  -- Get current user balance
  SELECT * INTO user_record FROM profiles WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if deduction would result in negative balance
  IF coin_amount < 0 AND user_record.coins < ABS(coin_amount) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient coins',
      'required', ABS(coin_amount),
      'available', user_record.coins
    );
  END IF;
  
  -- Update balance
  UPDATE profiles 
  SET coins = coins + coin_amount, updated_at = NOW()
  WHERE id = user_uuid;
  
  -- Get new balance
  SELECT coins INTO new_balance FROM profiles WHERE id = user_uuid;
  
  -- Create transaction record
  INSERT INTO coin_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    reference_id
  ) VALUES (
    user_uuid,
    coin_amount,
    transaction_type_param,
    description_param,
    reference_uuid
  );
  
  RETURN json_build_object(
    'success', true,
    'new_balance', new_balance,
    'amount_changed', coin_amount
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get user analytics summary
CREATE OR REPLACE FUNCTION get_user_analytics_summary_fixed(user_uuid UUID)
RETURNS TABLE(
  total_videos_promoted INTEGER,
  total_coins_earned INTEGER,
  active_videos INTEGER,
  completed_videos INTEGER,
  on_hold_videos INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM videos WHERE user_id = user_uuid) as total_videos_promoted,
    (SELECT COALESCE(SUM(amount), 0)::INTEGER FROM coin_transactions WHERE user_id = user_uuid AND amount > 0) as total_coins_earned,
    (SELECT COUNT(*)::INTEGER FROM videos WHERE user_id = user_uuid AND status = 'active') as active_videos,
    (SELECT COUNT(*)::INTEGER FROM videos WHERE user_id = user_uuid AND status = 'completed') as completed_videos,
    (SELECT COUNT(*)::INTEGER FROM videos WHERE user_id = user_uuid AND status = 'on_hold') as on_hold_videos;
END;
$$ LANGUAGE plpgsql;

-- Function to check and update expired holds
CREATE OR REPLACE FUNCTION check_and_update_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update videos from on_hold to active if hold_until has passed
  UPDATE videos 
  SET status = 'active', updated_at = NOW()
  WHERE status = 'on_hold' 
  AND hold_until <= NOW()
  AND views_count < target_views;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired transactions
CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired transactions older than 60 seconds
  DELETE FROM coin_transactions 
  WHERE expires_at IS NOT NULL 
  AND expires_at < NOW()
  AND transaction_type = 'video_watch';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get video engagement analytics
CREATE OR REPLACE FUNCTION get_video_engagement_analytics(video_uuid UUID)
RETURNS JSON AS $$
DECLARE
  video_record RECORD;
  engagement_data RECORD;
BEGIN
  -- Get video details with engagement metrics
  SELECT 
    v.*,
    COALESCE(v.total_watch_time, 0) as total_watch_time,
    COALESCE(v.engagement_rate, 0) as engagement_rate,
    COALESCE(v.completion_rate, 0) as completion_rate,
    COALESCE(v.average_watch_time, 0) as average_watch_time
  INTO video_record
  FROM videos v
  WHERE v.id = video_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Video not found');
  END IF;
  
  -- Get additional engagement statistics from transactions
  SELECT 
    COUNT(*) as total_views,
    SUM(engagement_duration) as total_engagement,
    AVG(engagement_duration) as avg_engagement,
    COUNT(CASE WHEN engagement_duration >= video_record.duration_seconds THEN 1 END) as completed_views
  INTO engagement_data
  FROM coin_transactions
  WHERE reference_id = video_uuid 
  AND transaction_type = 'video_watch';
  
  RETURN json_build_object(
    'video_id', video_record.id,
    'title', video_record.title,
    'views_count', video_record.views_count,
    'target_views', video_record.target_views,
    'total_watch_time', video_record.total_watch_time,
    'engagement_rate', video_record.engagement_rate,
    'completion_rate', video_record.completion_rate,
    'average_watch_time', video_record.average_watch_time,
    'total_views_from_transactions', COALESCE(engagement_data.total_views, 0),
    'total_engagement_from_transactions', COALESCE(engagement_data.total_engagement, 0),
    'avg_engagement_from_transactions', COALESCE(engagement_data.avg_engagement, 0),
    'completed_views', COALESCE(engagement_data.completed_views, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check promotion queue eligibility
CREATE OR REPLACE FUNCTION check_promotion_queue_eligibility(video_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  video_record RECORD;
BEGIN
  -- Get video details
  SELECT views_count, target_views, status, hold_until
  INTO video_record
  FROM videos 
  WHERE id = video_uuid;
  
  -- Return false if video doesn't exist
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if video has reached target views
  IF video_record.views_count >= video_record.target_views THEN
    -- Update video status to completed if it reached target
    UPDATE videos 
    SET status = 'completed', updated_at = NOW()
    WHERE id = video_uuid AND status IN ('active', 'repromoted', 'on_hold');
    
    RETURN FALSE; -- Remove from promotion queue
  END IF;
  
  -- Video is eligible if it's active, repromoted, or on_hold with expired hold_until
  RETURN video_record.status IN ('active', 'repromoted') OR 
         (video_record.status = 'on_hold' AND video_record.hold_until <= NOW());
END;
$$ LANGUAGE plpgsql;

-- Insert some sample data for testing (optional - remove in production)
-- This creates a test user and some sample videos
/*
INSERT INTO profiles (id, email, username, coins) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'testuser', 1000);

INSERT INTO videos (user_id, youtube_url, title, target_views, duration_seconds, coin_reward, coin_cost, status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'dQw4w9WgXcQ', 'Sample Video 1', 100, 60, 25, 200, 'active'),
  ('00000000-0000-0000-0000-000000000001', 'jNQXAC9IVRw', 'Sample Video 2', 50, 45, 15, 150, 'active');
*/

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;