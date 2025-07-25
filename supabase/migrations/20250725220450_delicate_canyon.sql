/*
  # Fix Duplicate Coin Rewards - Enhanced Database Protection
  
  This migration adds additional database-level protections to prevent duplicate
  coin rewards and improve the reliability of the coin earning system.

  ## Key Improvements
  1. Enhanced duplicate prevention in award_coins_optimized function
  2. Better error handling and logging
  3. Atomic operations with proper rollback
  4. Additional validation checks
  5. Improved race condition handling
*/

-- ============================================================================
-- ENHANCED DUPLICATE PREVENTION FUNCTION
-- ============================================================================

-- Enhanced version of award_coins_optimized with better duplicate prevention
CREATE OR REPLACE FUNCTION award_coins_optimized(
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
    -- Log the function call
    RAISE LOG 'award_coins_optimized called for user % video % duration %', user_uuid, video_uuid, watch_duration;
    
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
        RAISE LOG 'User % attempted to watch own video %', user_uuid, video_uuid;
        RETURN json_build_object('success', false, 'error', 'Cannot watch own video');
    END IF;
    
    -- Validate video is available
    IF video_record.status NOT IN ('active', 'repromoted') THEN
        RAISE LOG 'Video % not available, status: %', video_uuid, video_record.status;
        RETURN json_build_object('success', false, 'error', 'Video not available');
    END IF;
    
    -- Check if video has reached target views
    IF video_record.views_count >= video_record.target_views THEN
        RAISE LOG 'Video % has reached maximum views: %/%', video_uuid, video_record.views_count, video_record.target_views;
        RETURN json_build_object('success', false, 'error', 'Video has reached maximum views');
    END IF;
    
    -- CRITICAL: Multiple duplicate checks
    
    -- Check 1: Existing completed view
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RAISE LOG 'User % already completed video %', user_uuid, video_uuid;
        RETURN json_build_object('success', false, 'error', 'Already completed this video');
    END IF;
    
    -- Check 2: Existing coin transaction for this video
    SELECT COUNT(*) INTO transaction_check
    FROM coin_transactions 
    WHERE user_id = user_uuid 
        AND reference_id = video_uuid 
        AND transaction_type = 'video_watch';
    
    IF transaction_check > 0 THEN
        RAISE LOG 'Duplicate coin transaction prevented for user % video %', user_uuid, video_uuid;
        RETURN json_build_object('success', false, 'error', 'Coins already awarded for this video');
    END IF;
    
    -- Check 3: Additional safety check in user_balances transaction log
    SELECT COUNT(*) INTO duplicate_check
    FROM coin_transactions ct
    WHERE ct.user_id = user_uuid 
        AND ct.reference_id = video_uuid 
        AND ct.transaction_type = 'video_watch'
        AND ct.created_at > (now() - interval '1 hour'); -- Recent duplicates
    
    IF duplicate_check > 0 THEN
        RAISE LOG 'Recent duplicate transaction found for user % video %', user_uuid, video_uuid;
        RETURN json_build_object('success', false, 'error', 'Recent transaction already exists for this video');
    END IF;
    
    -- Validate sufficient watch time
    IF watch_duration < video_record.duration_seconds THEN
        RAISE LOG 'Insufficient watch time for user % video %: %/%', user_uuid, video_uuid, watch_duration, video_record.duration_seconds;
        
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
    
    -- Record completed view first (prevents race conditions)
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = CASE 
            WHEN video_views.completed = true THEN video_views.completed
            ELSE true
        END,
        coins_earned = CASE 
            WHEN video_views.completed = true THEN video_views.coins_earned
            ELSE EXCLUDED.coins_earned
        END,
        created_at = CASE 
            WHEN video_views.completed = true THEN video_views.created_at
            ELSE now()
        END;
    
    -- Check if this was actually a new completion (not an update of existing completion)
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RAISE LOG 'Video view was already completed, not awarding coins again';
        RETURN json_build_object('success', false, 'error', 'Video already completed');
    END IF;
    
    -- Award coins using optimized balance system
    SELECT update_user_balance_atomic(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Completed watching: ' || video_record.title,
        video_uuid
    ) INTO balance_result;
    
    IF NOT (balance_result->>'success')::boolean THEN
        RAISE LOG 'Coin award failed for user % video %: %', user_uuid, video_uuid, balance_result->>'error';
        
        -- Rollback the video view if coin award failed
        UPDATE video_views 
        SET completed = false, coins_earned = 0
        WHERE video_id = video_uuid AND viewer_id = user_uuid;
        
        RETURN balance_result;
    END IF;
    
    RAISE LOG 'Successfully awarded % coins to user % for video %', coins_to_award, user_uuid, video_uuid;
    
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
    
    RETURN json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'new_balance', (balance_result->>'new_balance')::integer,
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_optimized for user % video %: %', user_uuid, video_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- ADDITIONAL SAFETY CONSTRAINTS
-- ============================================================================

-- Add unique constraint to prevent duplicate video views if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'video_views_unique_completion' 
        AND table_name = 'video_views'
    ) THEN
        -- Add constraint to prevent duplicate completed views
        ALTER TABLE video_views 
        ADD CONSTRAINT video_views_unique_completion 
        UNIQUE (video_id, viewer_id);
        
        RAISE NOTICE 'Added unique constraint to prevent duplicate video views';
    END IF;
END $$;

-- Add index for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_coin_transactions_duplicate_check 
ON coin_transactions(user_id, reference_id, transaction_type, created_at) 
WHERE transaction_type = 'video_watch';

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION award_coins_optimized(uuid, uuid, integer) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🛡️ Enhanced Duplicate Coin Reward Prevention Deployed!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Improvements Made:';
    RAISE NOTICE '  ✓ Multiple duplicate checks in award_coins_optimized';
    RAISE NOTICE '  ✓ Enhanced logging for debugging';
    RAISE NOTICE '  ✓ Better race condition handling';
    RAISE NOTICE '  ✓ Atomic operations with proper rollback';
    RAISE NOTICE '  ✓ Additional safety constraints';
    RAISE NOTICE '  ✓ Improved error handling';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Duplicate Prevention Layers:';
    RAISE NOTICE '  1. Client-side processing flags';
    RAISE NOTICE '  2. Database video_views completion check';
    RAISE NOTICE '  3. Coin transaction reference_id check';
    RAISE NOTICE '  4. Recent transaction time-based check';
    RAISE NOTICE '  5. Unique constraints on database level';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 System should now prevent all duplicate coin rewards!';
END $$;