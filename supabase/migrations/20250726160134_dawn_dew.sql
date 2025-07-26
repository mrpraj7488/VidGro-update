/*
  # Fix Double Trigger Coin Reward Issue
  
  This script resolves the conflict where two separate systems are trying to award coins:
  1. Removes any duplicate triggers/functions causing double coin awards
  2. Consolidates to single coin award system using award_coins_optimized()
  3. Ensures every video gets rewarded exactly once
  4. Fixes the user_balances vs coin_transactions conflict
*/

-- ============================================================================
-- STEP 1: IDENTIFY AND REMOVE DUPLICATE TRIGGERS/FUNCTIONS
-- ============================================================================

-- Drop any old/duplicate coin award functions that might be causing conflicts
DROP FUNCTION IF EXISTS update_user_coins_direct(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS update_user_coins(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS award_coins_for_video(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS process_video_reward(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS update_balance_direct(uuid, integer, text, text, uuid) CASCADE;

-- Drop any triggers that might be auto-awarding coins
DROP TRIGGER IF EXISTS auto_coin_reward_trigger ON video_views CASCADE;
DROP TRIGGER IF EXISTS balance_update_trigger ON profiles CASCADE;
DROP TRIGGER IF EXISTS coin_award_trigger ON coin_transactions CASCADE;

-- ============================================================================
-- STEP 2: CREATE UNIFIED COIN AWARD SYSTEM
-- ============================================================================

-- Updated award_coins_optimized with better duplicate prevention and logging
CREATE OR REPLACE FUNCTION award_coins_optimized_fixed(
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
    balance_result json;
    duplicate_check integer;
    transaction_check integer;
BEGIN
    -- Add extensive logging for debugging
    RAISE LOG 'award_coins_optimized_fixed called: user=%, video=%, duration=%', user_uuid, video_uuid, watch_duration;
    
    -- Get video details with row lock to prevent race conditions
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid
    FOR UPDATE;
    
    IF video_record IS NULL THEN
        RAISE LOG 'Video not found: %', video_uuid;
        RETURN json_build_object('success', false, 'error', 'Video not found');
    END IF;
    
    -- Validate user is not video owner
    IF video_record.user_id = user_uuid THEN
        RAISE LOG 'User trying to watch own video: user=%, video=%', user_uuid, video_uuid;
        RETURN json_build_object('success', false, 'error', 'Cannot watch own video');
    END IF;
    
    -- Validate video is available
    IF video_record.status NOT IN ('active', 'repromoted') THEN
        RAISE LOG 'Video not available: video=%, status=%', video_uuid, video_record.status;
        RETURN json_build_object('success', false, 'error', 'Video not available');
    END IF;
    
    -- Check if video has reached target views
    IF video_record.views_count >= video_record.target_views THEN
        RAISE LOG 'Video reached max views: video=%, views=%, target=%', video_uuid, video_record.views_count, video_record.target_views;
        RETURN json_build_object('success', false, 'error', 'Video has reached maximum views');
    END IF;
    
    -- CRITICAL: Multiple duplicate checks
    
    -- Check 1: Existing completed video view
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RAISE LOG 'Video already completed by user: user=%, video=%', user_uuid, video_uuid;
        RETURN json_build_object(
            'success', true, 
            'duplicate', true,
            'message', 'Video already completed - no additional reward',
            'coins_earned', 0
        );
    END IF;
    
    -- Check 2: Existing coin transaction for this video
    SELECT COUNT(*) INTO transaction_check
    FROM coin_transactions 
    WHERE user_id = user_uuid 
        AND reference_id = video_uuid 
        AND transaction_type = 'video_watch';
    
    IF transaction_check > 0 THEN
        RAISE LOG 'Coins already awarded in transaction: user=%, video=%', user_uuid, video_uuid;
        RETURN json_build_object(
            'success', true,
            'duplicate', true, 
            'message', 'Coins already awarded for this video',
            'coins_earned', 0
        );
    END IF;
    
    -- Validate sufficient watch time
    IF watch_duration < video_record.duration_seconds THEN
        RAISE LOG 'Insufficient watch time: watched=%, required=%', watch_duration, video_record.duration_seconds;
        
        -- Record incomplete view without coins
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
    RAISE LOG 'Awarding coins: user=%, video=%, amount=%', user_uuid, video_uuid, coins_to_award;
    
    -- Record completed view FIRST (prevents race conditions)
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = true,
        coins_earned = EXCLUDED.coins_earned,
        created_at = now();
    
    RAISE LOG 'Video view recorded: user=%, video=%, completed=true', user_uuid, video_uuid;
    
    -- Award coins using unified balance system
    SELECT update_user_balance_atomic(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Completed watching: ' || video_record.title,
        video_uuid
    ) INTO balance_result;
    
    RAISE LOG 'Balance update result: %', balance_result;
    
    IF NOT (balance_result->>'success')::boolean THEN
        RAISE LOG 'Balance update failed: %', balance_result->>'error';
        
        -- Rollback the video view if coin award failed
        UPDATE video_views 
        SET completed = false, coins_earned = 0
        WHERE video_id = video_uuid AND viewer_id = user_uuid;
        
        RETURN balance_result;
    END IF;
    
    -- Update video statistics atomically
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
    
    RAISE LOG 'Coins awarded successfully: user=%, video=%, amount=%, new_balance=%', 
        user_uuid, video_uuid, coins_to_award, (balance_result->>'new_balance')::integer;
    
    RETURN json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'new_balance', (balance_result->>'new_balance')::integer,
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views),
        'duplicate', false
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_optimized_fixed: user=%, video=%, error=%', user_uuid, video_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- STEP 3: CLEAR ANY EXISTING DUPLICATE PREVENTION ISSUES
-- ============================================================================

-- Function to reset video reward status if needed (for testing/debugging)
CREATE OR REPLACE FUNCTION reset_video_reward_status(
    user_uuid uuid,
    video_uuid uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Remove existing video view record
    DELETE FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    -- Remove existing coin transaction record
    DELETE FROM coin_transactions 
    WHERE user_id = user_uuid 
        AND reference_id = video_uuid 
        AND transaction_type = 'video_watch';
    
    RAISE LOG 'Reset reward status: user=%, video=%', user_uuid, video_uuid;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Video reward status reset successfully'
    );
END;
$$;

-- ============================================================================
-- STEP 4: CREATE SINGLE ENTRY POINT FOR COIN REWARDS
-- ============================================================================

-- This should be the ONLY function your frontend calls for video rewards
CREATE OR REPLACE FUNCTION process_video_completion(
    user_uuid uuid,
    video_uuid uuid,
    watch_duration integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    RAISE LOG 'process_video_completion called: user=%, video=%, duration=%', user_uuid, video_uuid, watch_duration;
    
    -- Call the unified coin award function
    SELECT award_coins_optimized_fixed(user_uuid, video_uuid, watch_duration) INTO result;
    
    RAISE LOG 'process_video_completion result: %', result;
    
    RETURN result;
END;
$$;

-- ============================================================================
-- STEP 5: PERMISSIONS AND CLEANUP
-- ============================================================================

-- Grant permissions
GRANT EXECUTE ON FUNCTION award_coins_optimized_fixed(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_video_reward_status(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_video_completion(uuid, uuid, integer) TO authenticated;

-- Remove permissions from old functions (if they exist)
REVOKE ALL ON FUNCTION award_coins_optimized(uuid, uuid, integer) FROM authenticated;

-- ============================================================================
-- STEP 6: DIAGNOSTIC QUERIES
-- ============================================================================

-- Query to check for duplicate rewards (run this to see current state)
CREATE OR REPLACE FUNCTION check_duplicate_rewards(user_uuid uuid)
RETURNS TABLE(
    video_id uuid,
    video_title text,
    view_completed boolean,
    coins_from_view integer,
    transaction_count bigint,
    coins_from_transactions integer
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id as video_id,
        v.title as video_title,
        COALESCE(vv.completed, false) as view_completed,
        COALESCE(vv.coins_earned, 0) as coins_from_view,
        COALESCE(ct.transaction_count, 0) as transaction_count,
        COALESCE(ct.total_coins, 0) as coins_from_transactions
    FROM videos v
    LEFT JOIN video_views vv ON v.id = vv.video_id AND vv.viewer_id = user_uuid
    LEFT JOIN (
        SELECT 
            reference_id,
            COUNT(*) as transaction_count,
            SUM(amount) as total_coins
        FROM coin_transactions 
        WHERE user_id = user_uuid 
            AND transaction_type = 'video_watch'
            AND reference_id IS NOT NULL
        GROUP BY reference_id
    ) ct ON v.id = ct.reference_id
    WHERE vv.viewer_id = user_uuid OR ct.reference_id IS NOT NULL
    ORDER BY v.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_rewards(uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 Double Trigger Issue Fixed!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Changes Made:';
    RAISE NOTICE '  ✓ Removed duplicate coin award functions/triggers';
    RAISE NOTICE '  ✓ Created unified award_coins_optimized_fixed() function';
    RAISE NOTICE '  ✓ Added extensive logging for debugging';
    RAISE NOTICE '  ✓ Enhanced duplicate prevention checks';
    RAISE NOTICE '  ✓ Created single entry point: process_video_completion()';
    RAISE NOTICE '';
    RAISE NOTICE '📱 Frontend Changes Needed:';
    RAISE NOTICE '  ❗ Replace ALL coin award calls with: process_video_completion()';
    RAISE NOTICE '  ❗ Remove any direct calls to updateUserCoins() for video rewards';
    RAISE NOTICE '  ❗ Ensure only ONE function is called per video completion';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Debugging:';
    RAISE NOTICE '  ✓ Use check_duplicate_rewards(user_id) to see current state';
    RAISE NOTICE '  ✓ Use reset_video_reward_status() to clear conflicts if needed';
    RAISE NOTICE '  ✓ Check logs for detailed execution flow';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Every video should now reward coins exactly once!';
END $$;