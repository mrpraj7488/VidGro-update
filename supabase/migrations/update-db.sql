-- VidGro Database Migration - Remove video_views table and update schema
-- This migration implements all requested changes

BEGIN;

-- 1. DROP AND REMOVE video_views table completely
DROP TABLE IF EXISTS video_views CASCADE;

-- 2. MODIFY videos table - Remove unwanted columns and add completed column
ALTER TABLE videos 
  DROP COLUMN IF EXISTS engagement_rate CASCADE,
  DROP COLUMN IF EXISTS average_watch_time CASCADE,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- 3. DROP existing triggers that might interfere
DROP TRIGGER IF EXISTS trigger_update_video_engagement ON coin_transactions;
DROP FUNCTION IF EXISTS update_video_engagement_metrics();

-- 4. CREATE new trigger function for real-time updates
CREATE OR REPLACE FUNCTION update_video_metrics_realtime()
RETURNS TRIGGER AS $$
DECLARE
  video_record RECORD;
  total_views INTEGER;
  total_engagement INTEGER;
BEGIN
  -- Only process video_watch transactions
  IF NEW.transaction_type = 'video_watch' AND NEW.reference_id IS NOT NULL THEN
    
    -- Get current video data
    SELECT * INTO video_record FROM videos WHERE id = NEW.reference_id;
    
    IF FOUND THEN
      -- Calculate aggregated data from coin_transactions
      SELECT 
        COALESCE(SUM(view_count), 0),
        COALESCE(SUM(engagement_duration), 0)
      INTO total_views, total_engagement
      FROM coin_transactions 
      WHERE reference_id = NEW.reference_id 
      AND transaction_type = 'video_watch';
      
      -- Update videos table with real-time data
      UPDATE videos 
      SET 
        views_count = total_views,
        total_watch_time = total_engagement,
        completion_rate = CASE 
          WHEN target_views > 0 THEN 
            LEAST(100.0, (total_views::decimal / target_views) * 100)
          ELSE 0.0
        END,
        completed = (total_views >= target_views),
        status = CASE 
          WHEN total_views >= target_views THEN 'completed'
          WHEN status = 'on_hold' AND hold_until <= NOW() THEN 'active'
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = NEW.reference_id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. CREATE trigger for real-time video metrics updates
CREATE TRIGGER trigger_update_video_metrics_realtime
  AFTER INSERT ON coin_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_video_metrics_realtime();

-- 6. CREATE function to clean up expired transactions (runs every 60 seconds)
CREATE OR REPLACE FUNCTION cleanup_expired_transactions_enhanced()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  affected_videos UUID[];
BEGIN
  -- Get video IDs that will be affected by deletion
  SELECT array_agg(DISTINCT reference_id) INTO affected_videos
  FROM coin_transactions 
  WHERE expires_at IS NOT NULL 
  AND expires_at < NOW()
  AND transaction_type = 'video_watch'
  AND reference_id IS NOT NULL;
  
  -- Delete expired transactions
  DELETE FROM coin_transactions 
  WHERE expires_at IS NOT NULL 
  AND expires_at < NOW()
  AND transaction_type = 'video_watch';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Update affected videos with recalculated metrics
  IF array_length(affected_videos, 1) > 0 THEN
    UPDATE videos 
    SET 
      views_count = COALESCE((
        SELECT SUM(view_count) 
        FROM coin_transactions 
        WHERE reference_id = videos.id 
        AND transaction_type = 'video_watch'
      ), 0),
      total_watch_time = COALESCE((
        SELECT SUM(engagement_duration) 
        FROM coin_transactions 
        WHERE reference_id = videos.id 
        AND transaction_type = 'video_watch'
      ), 0),
      completion_rate = CASE 
        WHEN target_views > 0 THEN 
          LEAST(100.0, (COALESCE((
            SELECT SUM(view_count) 
            FROM coin_transactions 
            WHERE reference_id = videos.id 
            AND transaction_type = 'video_watch'
          ), 0)::decimal / target_views) * 100)
        ELSE 0.0
      END,
      completed = (COALESCE((
        SELECT SUM(view_count) 
        FROM coin_transactions 
        WHERE reference_id = videos.id 
        AND transaction_type = 'video_watch'
      ), 0) >= target_views),
      updated_at = NOW()
    WHERE id = ANY(affected_videos);
  END IF;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 7. UPDATE video queue functions to allow looping (remove already watched restrictions)
CREATE OR REPLACE FUNCTION get_next_video_queue_looping(user_uuid UUID)
RETURNS TABLE(
  video_id UUID,
  youtube_url TEXT,
  title TEXT,
  duration_seconds INTEGER,
  coin_reward INTEGER,
  views_count INTEGER,
  target_views INTEGER,
  status TEXT,
  user_id UUID,
  completed BOOLEAN
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
    v.user_id,
    v.completed
  FROM videos v
  WHERE (
    v.status IN ('active', 'repromoted') OR 
    (v.status = 'on_hold' AND v.hold_until <= NOW())
  )
  AND v.user_id != user_uuid  -- Exclude user's own videos
  AND v.completed = FALSE     -- Only include videos that haven't met their target
  ORDER BY 
    CASE WHEN v.status = 'repromoted' THEN 0 
         WHEN v.status = 'active' THEN 1 
         ELSE 2 END,
    v.created_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- 8. UPDATE enhanced video queue function (replaces the old one)
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
  -- First priority: Get videos that haven't reached target views
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
  AND v.completed = FALSE     -- Only videos that haven't met target
  ORDER BY 
    CASE WHEN v.status = 'repromoted' THEN 0 
         WHEN v.status = 'active' THEN 1 
         ELSE 2 END,
    v.created_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- 9. CREATE function to reset queue when no videos available (looping mechanism)
CREATE OR REPLACE FUNCTION check_and_loop_video_queue(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  available_videos INTEGER;
BEGIN
  -- Check if there are any available videos for the user
  SELECT COUNT(*) INTO available_videos
  FROM videos v
  WHERE (
    v.status IN ('active', 'repromoted') OR 
    (v.status = 'on_hold' AND v.hold_until <= NOW())
  )
  AND v.user_id != user_uuid
  AND v.completed = FALSE;
  
  -- If no videos available, this means all videos have been watched
  -- The queue will automatically loop because we removed the "already watched" restriction
  
  RETURN (available_videos > 0);
END;
$$ LANGUAGE plpgsql;

-- 10. UPDATE award_coins function to work with new schema
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
  -- This will automatically trigger the video metrics update
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
    1, -- This adds 1 to views_count
    actual_engagement, -- This adds to total_watch_time
    NOW() + INTERVAL '60 seconds'
  ) RETURNING id INTO transaction_id;
  
  RETURN json_build_object(
    'success', true,
    'coins_awarded', coins_to_award,
    'new_balance', new_balance,
    'engagement_duration', actual_engagement,
    'transaction_id', transaction_id,
    'video_completed', (video_record.views_count + 1 >= video_record.target_views)
  );
END;
$$ LANGUAGE plpgsql;

-- 11. UPDATE video analytics function to work with new schema
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
    COALESCE(v.completion_rate, 0) as completion_rate
  INTO video_record
  FROM videos v
  WHERE v.id = video_uuid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Video not found');
  END IF;
  
  -- Get additional engagement statistics from transactions
  SELECT 
    COUNT(*) as total_transactions,
    SUM(view_count) as total_views,
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
    'completion_rate', video_record.completion_rate,
    'completed', video_record.completed,
    'status', video_record.status,
    'total_transactions', COALESCE(engagement_data.total_transactions, 0),
    'total_views_from_transactions', COALESCE(engagement_data.total_views, 0),
    'total_engagement_from_transactions', COALESCE(engagement_data.total_engagement, 0),
    'avg_engagement_from_transactions', COALESCE(engagement_data.avg_engagement, 0),
    'completed_views', COALESCE(engagement_data.completed_views, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- 12. UPDATE indexes for better performance
DROP INDEX IF EXISTS idx_video_views_video_id;
DROP INDEX IF EXISTS idx_video_views_viewer_id;
DROP INDEX IF EXISTS idx_video_views_unique;

-- Add new index for completed column
CREATE INDEX IF NOT EXISTS idx_videos_completed ON videos(completed) WHERE completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_videos_status_completed ON videos(status, completed);

-- 13. UPDATE Row Level Security policies (remove video_views policies)
-- Videos policies remain the same, just ensure they work with new completed column

-- 14. Grant permissions to new functions
GRANT EXECUTE ON FUNCTION get_next_video_queue_looping(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_loop_video_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_transactions_enhanced() TO authenticated;

-- 15. Update existing data to set proper completed status
UPDATE videos 
SET completed = (views_count >= target_views)
WHERE completed IS NULL OR completed != (views_count >= target_views);

-- 16. Create a function to periodically run cleanup (can be called by a cron job or scheduler)
CREATE OR REPLACE FUNCTION run_periodic_cleanup()
RETURNS JSON AS $$
DECLARE
  expired_cleaned INTEGER;
  holds_updated INTEGER;
BEGIN
  -- Clean up expired transactions
  SELECT cleanup_expired_transactions_enhanced() INTO expired_cleaned;
  
  -- Update expired holds
  SELECT check_and_update_expired_holds() INTO holds_updated;
  
  RETURN json_build_object(
    'expired_transactions_cleaned', expired_cleaned,
    'holds_updated', holds_updated,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION run_periodic_cleanup() TO authenticated;

COMMIT;

-- Note: After running this migration, you should set up a cron job or scheduled task
-- to run SELECT run_periodic_cleanup(); every 60 seconds to clean up expired transactions