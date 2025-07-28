-- Enhanced Video Tracking System - Clean Migration Script
-- Run this script to add engagement tracking and auto-cleanup features

-- Add new columns to coin_transactions table for enhanced tracking
DO $$
BEGIN
  -- Add view_count column to track individual video plays
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coin_transactions' AND column_name = 'view_count'
  ) THEN
    ALTER TABLE coin_transactions ADD COLUMN view_count INTEGER DEFAULT 1;
  END IF;

  -- Add engagement_duration column to store viewing time in seconds
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coin_transactions' AND column_name = 'engagement_duration'
  ) THEN
    ALTER TABLE coin_transactions ADD COLUMN engagement_duration INTEGER DEFAULT 0;
  END IF;

  -- Add expires_at column with 60-second auto-expiry from creation time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coin_transactions' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE coin_transactions ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (now() + interval '60 seconds');
  END IF;
END $$;

-- Add engagement metrics columns to videos table
DO $$
BEGIN
  -- Add engagement_rate column to store calculated engagement metrics
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'engagement_rate'
  ) THEN
    ALTER TABLE videos ADD COLUMN engagement_rate DECIMAL(5,2) DEFAULT 0.0;
  END IF;

  -- Ensure total_watch_time column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'total_watch_time'
  ) THEN
    ALTER TABLE videos ADD COLUMN total_watch_time INTEGER DEFAULT 0;
  END IF;

  -- Ensure completion_rate column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'completion_rate'
  ) THEN
    ALTER TABLE videos ADD COLUMN completion_rate DECIMAL(5,2) DEFAULT 0.0;
  END IF;

  -- Ensure average_watch_time column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'average_watch_time'
  ) THEN
    ALTER TABLE videos ADD COLUMN average_watch_time DECIMAL(8,2) DEFAULT 0.0;
  END IF;
END $$;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_coin_transactions_reference_tracking 
ON coin_transactions(reference_id, user_id, engagement_duration, created_at) 
WHERE transaction_type = 'video_watch';

CREATE INDEX IF NOT EXISTS idx_coin_transactions_expires_at 
ON coin_transactions(expires_at) 
WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coin_transactions_view_count 
ON coin_transactions(reference_id, view_count, created_at) 
WHERE transaction_type = 'video_watch';

-- Create function to update video engagement metrics
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
      updated_at = now()
    WHERE id = NEW.reference_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for real-time data push system
DROP TRIGGER IF EXISTS trigger_update_video_engagement ON coin_transactions;
CREATE TRIGGER trigger_update_video_engagement
  AFTER INSERT ON coin_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_video_engagement_metrics();

-- Create function for auto-deletion of expired transactions
CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired transactions older than 60 seconds
  DELETE FROM coin_transactions 
  WHERE expires_at IS NOT NULL 
  AND expires_at < now()
  AND transaction_type = 'video_watch';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to check promotion queue eligibility
CREATE OR REPLACE FUNCTION check_promotion_queue_eligibility(video_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  video_record RECORD;
BEGIN
  -- Get video details
  SELECT views_count, target_views, status 
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
    SET status = 'completed', updated_at = now()
    WHERE id = video_uuid AND status IN ('active', 'repromoted');
    
    RETURN FALSE; -- Remove from promotion queue
  END IF;
  
  -- Video is still eligible for promotion
  RETURN video_record.status IN ('active', 'repromoted');
END;
$$ LANGUAGE plpgsql;

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_next_video_queue_enhanced(UUID);

-- Enhanced video queue function that excludes user's own videos
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
  WHERE v.status IN ('active', 'repromoted')
  AND v.user_id != user_uuid  -- Exclude user's own videos
  AND v.views_count < v.target_views
  AND NOT EXISTS (
    -- Exclude videos already watched by this user
    SELECT 1 FROM video_views vv 
    WHERE vv.video_id = v.id 
    AND vv.viewer_id = user_uuid
  )
  ORDER BY 
    CASE WHEN v.status = 'repromoted' THEN 0 ELSE 1 END,
    v.created_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS award_coins_with_engagement_tracking(UUID, UUID, INTEGER, INTEGER);

-- Enhanced award coins function with engagement tracking
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
  SET coins = coins + coins_to_award, updated_at = now()
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
    now() + interval '60 seconds'
  ) RETURNING id INTO transaction_id;
  
  -- Update video view count
  UPDATE videos 
  SET views_count = views_count + 1, updated_at = now()
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

-- Drop existing function first
DROP FUNCTION IF EXISTS award_coins_simple_no_filters(UUID, UUID, INTEGER);

-- Update existing award_coins_simple_no_filters to use engagement tracking
CREATE OR REPLACE FUNCTION award_coins_simple_no_filters(
  user_uuid UUID,
  video_uuid UUID,
  watch_duration INTEGER
)
RETURNS JSON AS $$
BEGIN
  -- Call the enhanced function with engagement tracking
  RETURN award_coins_with_engagement_tracking(user_uuid, video_uuid, watch_duration, watch_duration);
END;
$$ LANGUAGE plpgsql;

-- Create scheduled cleanup job function
CREATE OR REPLACE FUNCTION schedule_cleanup_expired_transactions()
RETURNS TEXT AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  SELECT cleanup_expired_transactions() INTO cleanup_count;
  
  RETURN 'Cleaned up ' || cleanup_count || ' expired transaction records';
END;
$$ LANGUAGE plpgsql;

-- Drop existing function first
DROP FUNCTION IF EXISTS get_next_video_queue_simple(UUID);

-- Update get_next_video_queue_simple to use the enhanced version
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
    evq.video_id,
    evq.youtube_url,
    evq.title,
    evq.duration_seconds,
    evq.coin_reward,
    evq.views_count,
    evq.target_views,
    evq.status
  FROM get_next_video_queue_enhanced(user_uuid) evq;
END;
$$ LANGUAGE plpgsql;

-- Drop existing function first
DROP FUNCTION IF EXISTS get_video_engagement_analytics(UUID);

-- Create function to get video engagement analytics
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