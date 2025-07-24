/*
  # Fix Missing award_coins_for_video_completion Function
  
  This migration adds the missing award_coins_for_video_completion function
  that the application code expects to call.
  
  1. New Functions
    - award_coins_for_video_completion: Award coins when user completes watching a video
  
  2. Features
    - Validates user hasn't already watched the video
    - Checks minimum watch duration (95% of video)
    - Awards coins and records the view
    - Updates video statistics
    - Marks video as completed when target views reached
*/

-- Function to award coins for video completion
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
    
    -- Check if user already watched this video
    IF EXISTS (SELECT 1 FROM video_views WHERE video_id = video_uuid AND viewer_id = user_uuid) THEN
        RETURN json_build_object('success', false, 'error', 'Already watched');
    END IF;
    
    -- Check if user is the video owner
    IF video_record.user_id = user_uuid THEN
        RETURN json_build_object('success', false, 'error', 'Cannot watch own video');
    END IF;
    
    -- Calculate required watch duration (95% of video)
    required_duration := FLOOR(video_record.duration_seconds * 0.95);
    
    -- Check if watched enough
    IF watch_duration < required_duration THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Insufficient watch time',
            'required', required_duration,
            'watched', watch_duration
        );
    END IF;
    
    -- Check if video is still active and has views remaining
    IF video_record.status != 'active' OR video_record.views_count >= video_record.target_views THEN
        RETURN json_build_object('success', false, 'error', 'Video no longer available');
    END IF;
    
    coins_to_award := video_record.coin_reward;
    
    -- Record the view
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award);
    
    -- Award coins to user using the improved function
    PERFORM update_user_coins_improved(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Watched video: ' || video_record.title,
        video_uuid
    );
    
    -- Update video stats
    UPDATE videos 
    SET 
        views_count = views_count + 1,
        total_watch_time = COALESCE(total_watch_time, 0) + watch_duration,
        completion_rate = (
            SELECT AVG(CASE WHEN completed THEN 100.0 ELSE 0.0 END)
            FROM video_views 
            WHERE video_id = video_uuid
        ),
        average_watch_time = (
            SELECT AVG(watched_duration)
            FROM video_views 
            WHERE video_id = video_uuid
        ),
        status = CASE 
            WHEN views_count + 1 >= target_views THEN 'completed'
            ELSE status
        END,
        updated_at = now()
    WHERE id = video_uuid;
    
    result := json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'views_remaining', video_record.target_views - video_record.views_count - 1,
        'video_completed', (video_record.views_count + 1 >= video_record.target_views)
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_for_video_completion: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION award_coins_for_video_completion(uuid, uuid, integer) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'award_coins_for_video_completion function created successfully!';
    RAISE NOTICE '✓ Function signature: award_coins_for_video_completion(user_uuid, video_uuid, watch_duration)';
    RAISE NOTICE '✓ Validates watch duration and user eligibility';
    RAISE NOTICE '✓ Awards coins and updates video statistics';
    RAISE NOTICE '✓ Returns detailed success/error information';
END $$;