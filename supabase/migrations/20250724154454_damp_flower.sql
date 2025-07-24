/*
  # Fix Video Reward System for Consistent Coin Earning
  
  This migration fixes the inconsistent coin earning issue where some videos
  give rewards and others don't. The fix ensures all valid video watches
  earn coins consistently.
  
  1. Issues Fixed
    - Inconsistent watch duration validation
    - Missing coin rewards for completed videos
    - Duplicate video view entries
    - Improved error handling and logging
  
  2. Improvements
    - More lenient watch duration requirement (85% instead of 95%)
    - Better validation logic
    - Consistent coin awarding
    - Cleanup of failed video view entries
*/

-- ============================================================================
-- IMPROVED VIDEO COMPLETION LOGIC
-- ============================================================================

-- Drop and recreate the award_coins_for_video_completion function with better logic
DROP FUNCTION IF EXISTS award_coins_for_video_completion(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION award_coins_for_video_completion(
    user_uuid uuid,
    video_uuid uuid,
    watch_duration integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    video_record videos%ROWTYPE;
    required_duration integer;
    coins_to_award integer;
    existing_view_record video_views%ROWTYPE;
    result json;
BEGIN
    -- Get video details with row lock
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid 
    FOR UPDATE;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Video not found');
    END IF;
    
    -- Check if user is the video owner
    IF video_record.user_id = user_uuid THEN
        RETURN json_build_object('success', false, 'error', 'Cannot watch own video');
    END IF;
    
    -- Check if video is available for watching
    IF video_record.status NOT IN ('active', 'repromoted') THEN
        RETURN json_build_object('success', false, 'error', 'Video not available for watching');
    END IF;
    
    -- Check if video has reached target views
    IF video_record.views_count >= video_record.target_views THEN
        RETURN json_build_object('success', false, 'error', 'Video has reached maximum views');
    END IF;
    
    -- Check for existing view record
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    -- If user already has a completed view, don't allow another
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RETURN json_build_object('success', false, 'error', 'Already completed this video');
    END IF;
    
    -- Calculate required watch duration (85% of video for more lenient validation)
    required_duration := FLOOR(video_record.duration_seconds * 0.85);
    
    -- Ensure minimum watch duration is reasonable
    IF required_duration < 10 THEN
        required_duration := LEAST(video_record.duration_seconds, 10);
    END IF;
    
    -- Validate watch duration
    IF watch_duration < required_duration THEN
        -- Update or insert incomplete view record
        INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
        VALUES (video_uuid, user_uuid, watch_duration, false, 0)
        ON CONFLICT (video_id, viewer_id) 
        DO UPDATE SET 
            watched_duration = GREATEST(video_views.watched_duration, EXCLUDED.watched_duration),
            updated_at = now();
            
        RETURN json_build_object(
            'success', false, 
            'error', 'Insufficient watch time',
            'required', required_duration,
            'watched', watch_duration,
            'percentage', ROUND((watch_duration::decimal / required_duration::decimal) * 100, 1)
        );
    END IF;
    
    coins_to_award := video_record.coin_reward;
    
    -- Insert or update the video view record as completed
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = true,
        coins_earned = EXCLUDED.coins_earned,
        created_at = now(); -- Update timestamp for completion
    
    -- Award coins to user using the improved function
    PERFORM update_user_coins_improved(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Watched video: ' || video_record.title,
        video_uuid
    );
    
    -- Update video statistics
    UPDATE videos 
    SET 
        views_count = (
            SELECT COUNT(*) 
            FROM video_views 
            WHERE video_id = video_uuid AND completed = true
        ),
        total_watch_time = COALESCE(total_watch_time, 0) + watch_duration,
        completion_rate = (
            SELECT COALESCE(AVG(CASE WHEN completed THEN 100.0 ELSE 0.0 END), 0)
            FROM video_views 
            WHERE video_id = video_uuid
        ),
        average_watch_time = (
            SELECT COALESCE(AVG(watched_duration), 0)
            FROM video_views 
            WHERE video_id = video_uuid AND completed = true
        ),
        status = CASE 
            WHEN (SELECT COUNT(*) FROM video_views WHERE video_id = video_uuid AND completed = true) >= target_views 
            THEN 'completed'
            ELSE status
        END,
        updated_at = now()
    WHERE id = video_uuid;
    
    -- Get updated views count
    SELECT views_count INTO video_record.views_count 
    FROM videos 
    WHERE id = video_uuid;
    
    result := json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views),
        'watch_duration', watch_duration,
        'required_duration', required_duration
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_for_video_completion for user % video %: % (SQLSTATE: %)', 
                  user_uuid, video_uuid, SQLERRM, SQLSTATE;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- IMPROVED VIDEO QUEUE FUNCTION
-- ============================================================================

-- Drop and recreate the get_next_video_for_user function with better filtering
DROP FUNCTION IF EXISTS get_next_video_for_user_enhanced(uuid);

CREATE OR REPLACE FUNCTION get_next_video_for_user_enhanced(user_uuid uuid)
RETURNS TABLE(
    video_id uuid,
    youtube_url text,
    title text,
    duration_seconds integer,
    coin_reward integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.youtube_url,
        v.title,
        v.duration_seconds,
        v.coin_reward
    FROM videos v
    WHERE v.status IN ('active', 'repromoted')
        AND v.views_count < v.target_views
        AND v.user_id != user_uuid
        AND NOT EXISTS (
            SELECT 1 FROM video_views vv 
            WHERE vv.video_id = v.id 
            AND vv.viewer_id = user_uuid 
            AND vv.completed = true
        )
    ORDER BY 
        CASE WHEN v.status = 'repromoted' THEN 0 ELSE 1 END, -- Prioritize repromoted videos
        v.created_at ASC
    LIMIT 15;
END;
$$;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to cleanup incomplete video views and fix data consistency
CREATE OR REPLACE FUNCTION cleanup_video_view_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cleanup_count integer := 0;
BEGIN
    -- Remove duplicate incomplete views (keep the latest one)
    WITH duplicate_views AS (
        SELECT 
            video_id, 
            viewer_id,
            array_agg(id ORDER BY created_at DESC) as view_ids
        FROM video_views 
        WHERE completed = false
        GROUP BY video_id, viewer_id
        HAVING COUNT(*) > 1
    )
    DELETE FROM video_views 
    WHERE id IN (
        SELECT unnest(view_ids[2:]) 
        FROM duplicate_views
    );
    
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Update video view counts to match actual completed views
    UPDATE videos 
    SET views_count = (
        SELECT COUNT(*) 
        FROM video_views 
        WHERE video_id = videos.id AND completed = true
    ),
    updated_at = now()
    WHERE EXISTS (
        SELECT 1 FROM video_views 
        WHERE video_id = videos.id
    );
    
    RETURN cleanup_count;
END;
$$;

-- Function to fix existing incomplete video views
CREATE OR REPLACE FUNCTION fix_incomplete_video_views()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    fixed_count integer := 0;
    view_record RECORD;
    video_record videos%ROWTYPE;
    required_duration integer;
BEGIN
    -- Find incomplete views that should have been completed
    FOR view_record IN 
        SELECT vv.*, v.duration_seconds, v.coin_reward, v.title
        FROM video_views vv
        JOIN videos v ON v.id = vv.video_id
        WHERE vv.completed = false 
        AND vv.watched_duration > 0
    LOOP
        -- Calculate required duration for this video
        required_duration := FLOOR(view_record.duration_seconds * 0.85);
        IF required_duration < 10 THEN
            required_duration := LEAST(view_record.duration_seconds, 10);
        END IF;
        
        -- If watch duration meets requirement, mark as completed and award coins
        IF view_record.watched_duration >= required_duration THEN
            -- Update the view record
            UPDATE video_views 
            SET 
                completed = true,
                coins_earned = view_record.coin_reward,
                created_at = now()
            WHERE id = view_record.id;
            
            -- Award coins to user
            PERFORM update_user_coins_improved(
                view_record.viewer_id,
                view_record.coin_reward,
                'video_watch',
                'Fixed reward for video: ' || view_record.title,
                view_record.video_id
            );
            
            fixed_count := fixed_count + 1;
        END IF;
    END LOOP;
    
    -- Update video statistics after fixing views
    UPDATE videos 
    SET 
        views_count = (
            SELECT COUNT(*) 
            FROM video_views 
            WHERE video_id = videos.id AND completed = true
        ),
        status = CASE 
            WHEN (SELECT COUNT(*) FROM video_views WHERE video_id = videos.id AND completed = true) >= target_views 
            THEN 'completed'
            ELSE status
        END,
        updated_at = now()
    WHERE id IN (
        SELECT DISTINCT video_id 
        FROM video_views 
        WHERE completed = true
    );
    
    RETURN fixed_count;
END;
$$;

-- ============================================================================
-- EXECUTE CLEANUP AND FIXES
-- ============================================================================

-- Run cleanup functions to fix existing data
SELECT cleanup_video_view_data() as cleaned_duplicates;
SELECT fix_incomplete_video_views() as fixed_incomplete_views;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION award_coins_for_video_completion(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_video_for_user_enhanced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_video_view_data() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_incomplete_video_views() TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Video reward system fixed successfully!';
    RAISE NOTICE '✓ More lenient watch duration requirement (85%% instead of 95%%)';
    RAISE NOTICE '✓ Better validation and error handling';
    RAISE NOTICE '✓ Consistent coin awarding for all valid video watches';
    RAISE NOTICE '✓ Cleanup of duplicate and incomplete video views';
    RAISE NOTICE '✓ Fixed existing incomplete video view records';
    RAISE NOTICE '✓ Improved video queue filtering';
    RAISE NOTICE '✓ All videos should now consistently award coins when watched properly';
END $$;