/*
  # Simple Timer-Based Coin Reward System

  This migration creates a simplified coin reward system that removes percentage-based
  calculations and implements a clean timer-based approach for earning coins.

  ## Changes Made
  1. New simplified coin reward function without percentage calculations
  2. Clean video view recording system
  3. Improved video queue management
  4. Timer-based completion logic

  ## Features
  - Simple timer completion = coin reward
  - No complex percentage calculations
  - Clean error handling
  - Seamless coin earning experience
*/

-- ============================================================================
-- SIMPLIFIED COIN REWARD SYSTEM
-- ============================================================================

-- Simple function to award coins when timer completes
CREATE OR REPLACE FUNCTION award_coins_simple_timer(
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
    coins_to_award integer;
    existing_view_record video_views%ROWTYPE;
    result json;
BEGIN
    -- Get video details
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Video not found');
    END IF;
    
    -- Validate user is not video owner
    IF video_record.user_id = user_uuid THEN
        RETURN json_build_object('success', false, 'error', 'Cannot watch own video');
    END IF;
    
    -- Validate video is available
    IF video_record.status NOT IN ('active', 'repromoted') THEN
        RETURN json_build_object('success', false, 'error', 'Video not available');
    END IF;
    
    -- Check if video has reached target views
    IF video_record.views_count >= video_record.target_views THEN
        RETURN json_build_object('success', false, 'error', 'Video has reached maximum views');
    END IF;
    
    -- Check for existing completed view
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RETURN json_build_object('success', false, 'error', 'Already completed this video');
    END IF;
    
    -- Simple validation: watch duration should be at least the video duration
    IF watch_duration < video_record.duration_seconds THEN
        -- Record incomplete view
        INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
        VALUES (video_uuid, user_uuid, watch_duration, false, 0)
        ON CONFLICT (video_id, viewer_id) 
        DO UPDATE SET 
            watched_duration = GREATEST(video_views.watched_duration, EXCLUDED.watched_duration);
            
        RETURN json_build_object(
            'success', false, 
            'error', 'Timer not completed',
            'required', video_record.duration_seconds,
            'watched', watch_duration
        );
    END IF;
    
    coins_to_award := video_record.coin_reward;
    
    -- Record completed view
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = true,
        coins_earned = EXCLUDED.coins_earned,
        created_at = now();
    
    -- Award coins to user
    PERFORM update_user_coins_improved(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Completed watching: ' || video_record.title,
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
    
    RETURN json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_simple_timer: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- ENHANCED VIDEO QUEUE MANAGEMENT
-- ============================================================================

-- Get next videos with better filtering and ordering
CREATE OR REPLACE FUNCTION get_next_video_queue_enhanced(user_uuid uuid)
RETURNS TABLE(
    video_id uuid,
    youtube_url text,
    title text,
    duration_seconds integer,
    coin_reward integer,
    views_count integer,
    target_views integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First, auto-update any expired holds
    PERFORM check_and_update_expired_holds();
    
    RETURN QUERY
    SELECT 
        v.id,
        v.youtube_url,
        v.title,
        v.duration_seconds,
        v.coin_reward,
        v.views_count,
        v.target_views,
        v.status
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
    LIMIT 20;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION award_coins_simple_timer(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_video_queue_enhanced(uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 Simple Timer-Based Coin Reward System Deployed!';
    RAISE NOTICE '';
    RAISE NOTICE '✨ Key Improvements:';
    RAISE NOTICE '  ✓ Removed complex percentage calculations';
    RAISE NOTICE '  ✓ Simple timer completion = coin reward';
    RAISE NOTICE '  ✓ Clean error handling and validation';
    RAISE NOTICE '  ✓ Seamless coin earning experience';
    RAISE NOTICE '  ✓ Enhanced video queue management';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 System is now optimized for consistent coin rewards!';
END $$;