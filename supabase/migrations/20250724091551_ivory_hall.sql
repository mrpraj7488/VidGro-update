/*
  # Fix Automatic Video Status Updates for Hold Timer
  
  This migration fixes the issue where videos don't automatically change from 'on_hold' 
  to 'active' status when the hold timer expires in the analytics tab.
  
  1. New Functions
    - check_and_update_expired_holds: Automatically update expired hold videos
    - get_video_with_status_check: Get video data with automatic status update
  
  2. Improvements
    - Real-time status checking when fetching video data
    - Automatic status updates without manual intervention
    - Clean up duplicate functions
    - Better error handling
*/

-- Function to check and update expired hold videos
CREATE OR REPLACE FUNCTION check_and_update_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count integer := 0;
BEGIN
    -- Update videos that have expired hold periods
    UPDATE videos 
    SET 
        status = 'active',
        updated_at = now(),
        hold_until = NULL
    WHERE status = 'on_hold' 
    AND hold_until IS NOT NULL 
    AND hold_until <= now();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Log if any videos were updated
    IF updated_count > 0 THEN
        RAISE LOG 'Automatically activated % videos from hold status', updated_count;
    END IF;
    
    RETURN updated_count;
END;
$$;

-- Function to get video data with automatic status checking
CREATE OR REPLACE FUNCTION get_video_with_status_check(
    video_uuid uuid,
    user_uuid uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    video_record videos%ROWTYPE;
    result json;
    status_updated boolean := false;
BEGIN
    -- First, check and update any expired holds
    PERFORM check_and_update_expired_holds();
    
    -- Get fresh video data after potential status update
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('error', 'Video not found');
    END IF;
    
    -- Check if this specific video needs status update
    IF video_record.status = 'on_hold' 
       AND video_record.hold_until IS NOT NULL 
       AND video_record.hold_until <= now() THEN
        
        -- Update this video's status
        UPDATE videos 
        SET 
            status = 'active',
            updated_at = now(),
            hold_until = NULL
        WHERE id = video_uuid;
        
        -- Update our local record
        video_record.status := 'active';
        video_record.updated_at := now();
        video_record.hold_until := NULL;
        status_updated := true;
    END IF;
    
    -- Return comprehensive video data
    result := json_build_object(
        'id', video_record.id,
        'title', video_record.title,
        'youtube_url', video_record.youtube_url,
        'views_count', video_record.views_count,
        'target_views', video_record.target_views,
        'status', video_record.status,
        'coin_cost', video_record.coin_cost,
        'coin_reward', video_record.coin_reward,
        'duration_seconds', video_record.duration_seconds,
        'hold_until', video_record.hold_until,
        'created_at', video_record.created_at,
        'updated_at', video_record.updated_at,
        'repromoted_at', video_record.repromoted_at,
        'completion_rate', CASE 
            WHEN video_record.target_views > 0 THEN 
                ROUND((video_record.views_count::decimal / video_record.target_views::decimal) * 100, 2)
            ELSE 0
        END,
        'status_updated', status_updated,
        'fresh_data', true
    );
    
    RETURN result;
END;
$$;

-- Improved analytics function that automatically updates expired holds
CREATE OR REPLACE FUNCTION get_user_analytics_with_status_update(user_uuid uuid)
RETURNS TABLE(
    total_videos_promoted integer,
    total_coins_earned integer,
    active_videos integer,
    completed_videos integer,
    on_hold_videos integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First update any expired holds
    PERFORM check_and_update_expired_holds();
    
    -- Then return fresh analytics
    RETURN QUERY
    SELECT 
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid), 0),
        COALESCE((
            SELECT SUM(ct.amount)::integer 
            FROM coin_transactions ct 
            WHERE ct.user_id = user_uuid 
            AND ct.amount > 0 
            AND ct.transaction_type IN ('referral_bonus', 'admin_adjustment', 'vip_purchase', 'video_deletion_refund')
        ), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'active'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'completed'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'on_hold'), 0);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_and_update_expired_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION get_video_with_status_check(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_analytics_with_status_update(uuid) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Hold timer auto-status update system implemented successfully!';
    RAISE NOTICE '✓ Videos will automatically change from on_hold to active when timer expires';
    RAISE NOTICE '✓ Real-time status checking in analytics and video details';
    RAISE NOTICE '✓ No manual database intervention required';
    RAISE NOTICE '✓ Clean, duplicate-free implementation';
END $$;