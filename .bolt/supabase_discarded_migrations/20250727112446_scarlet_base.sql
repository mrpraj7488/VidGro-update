/*
  # Simple Reward System - No Filters or Duplicate Prevention
  
  This migration creates a simplified reward system that:
  1. Removes all duplicate prevention checks
  2. Allows multiple rewards for the same video
  3. Fetches coin_reward directly from videos table
  4. Simplifies video queue to include all videos
  5. Ensures every timer completion awards coins
*/

-- ============================================================================
-- SIMPLIFIED VIDEO QUEUE FUNCTION (NO FILTERS)
-- ============================================================================

-- Get all available videos without any filtering
CREATE OR REPLACE FUNCTION get_next_video_queue_simple(user_uuid uuid)
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
    -- Auto-update any expired holds first
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
        -- Remove all filters - allow all videos including own videos and already watched
        -- AND v.user_id != user_uuid  -- REMOVED
        -- AND NOT EXISTS (...) -- REMOVED
    ORDER BY 
        CASE WHEN v.status = 'repromoted' THEN 0 ELSE 1 END, -- Prioritize repromoted videos
        v.created_at ASC
    LIMIT 50; -- Increased limit for more videos in queue
END;
$$;

-- ============================================================================
-- SIMPLIFIED COIN REWARD FUNCTION (NO DUPLICATE PREVENTION)
-- ============================================================================

-- Award coins every time timer completes - no duplicate checks
CREATE OR REPLACE FUNCTION award_coins_simple_no_filters(
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
    result json;
BEGIN
    -- Get video details - only basic info needed
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Video not found');
    END IF;
    
    -- Simple timer validation only
    IF watch_duration < video_record.duration_seconds THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Timer not completed',
            'required', video_record.duration_seconds,
            'watched', watch_duration
        );
    END IF;
    
    -- Use coin reward directly from database
    coins_to_award := video_record.coin_reward;
    
    -- Always award coins - no duplicate prevention
    PERFORM update_user_coins_simple(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Completed watching: ' || video_record.title,
        video_uuid
    );
    
    -- Optional: Record view for analytics (but don't use for duplicate prevention)
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = true,
        coins_earned = video_views.coins_earned + EXCLUDED.coins_earned, -- Add to existing earnings
        created_at = now();
    
    RETURN json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'message', format('Earned %s coins from %s second video!', coins_to_award, video_record.duration_seconds)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_simple_no_filters: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_next_video_queue_simple(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION award_coins_simple_no_filters(uuid, uuid, integer) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 Simple Reward System Created!';
    RAISE NOTICE '';
    RAISE NOTICE '✨ Features:';
    RAISE NOTICE '  ✓ No duplicate prevention - earn coins every time';
    RAISE NOTICE '  ✓ No video filters - watch any video including own';
    RAISE NOTICE '  ✓ Direct database fetch for coin_reward';
    RAISE NOTICE '  ✓ Simple timer completion = guaranteed coins';
    RAISE NOTICE '  ✓ Infinite video loop with rewards';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Every video timer completion will now award coins!';
END $$;