/*
  # Comprehensive Database Cleanup and Optimization - FIXED VERSION
  
  This migration addresses several critical issues:
  1. Removes transaction_audit_log table (redundant with coin_transactions)
  2. Filters video_watch transactions from user-facing history
  3. Fixes duplicate coin reward issues
  4. Optimizes database calls and removes unused functions
  5. Maintains user_balances table for performance
  6. Consolidates transaction management

  ## Key Changes
  - Drop transaction_audit_log table
  - Update all functions to use only coin_transactions
  - Filter transaction history to exclude video_watch rewards
  - Fix duplicate coin award prevention
  - Remove unused/duplicate functions
  - Optimize database performance
*/

-- ============================================================================
-- DROP ALL EXISTING FUNCTIONS FIRST TO AVOID TYPE CONFLICTS
-- ============================================================================

-- Drop all existing functions that might have different signatures
DROP FUNCTION IF EXISTS get_user_transaction_history(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS get_user_transaction_history(uuid) CASCADE;
DROP FUNCTION IF EXISTS update_user_balance_atomic(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS update_user_balance_atomic(uuid, integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS award_coins_optimized(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS create_video_optimized(integer, integer, integer, integer, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS delete_video_optimized(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_analytics_summary_fixed(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_analytics_summary(uuid) CASCADE;

-- Drop helper functions with all possible signatures
DROP FUNCTION IF EXISTS initialize_user_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS calculate_refund_amount(timestamptz, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_refund_amount(timestamp with time zone, integer) CASCADE;
DROP FUNCTION IF EXISTS check_and_update_expired_holds() CASCADE;

-- Drop unused functions that were creating complexity
DROP FUNCTION IF EXISTS migrate_coin_transactions_to_balances() CASCADE;
DROP FUNCTION IF EXISTS validate_balance_migration() CASCADE;
DROP FUNCTION IF EXISTS get_balance_system_metrics() CASCADE;
DROP FUNCTION IF EXISTS sync_profile_balance_to_user_balances() CASCADE;
DROP FUNCTION IF EXISTS update_user_coins_improved(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS award_coins_for_video_completion(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS award_coins_simple_timer(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS get_recent_activity(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS create_video_with_hold(integer, integer, integer, integer, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS delete_video_with_refund(uuid, uuid) CASCADE;

-- Drop any other potential function variants
DROP FUNCTION IF EXISTS calculate_refund_amount(timestamp with time zone, integer, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_refund_amount(timestamptz, integer, text) CASCADE;
DROP FUNCTION IF EXISTS update_user_balance(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS update_user_balance(uuid, integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS initialize_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS check_expired_holds() CASCADE;

-- Drop redundant triggers
DROP TRIGGER IF EXISTS sync_profile_balance_trigger ON profiles CASCADE;

-- ============================================================================
-- DROP REDUNDANT TABLES AND CLEANUP
-- ============================================================================

-- Drop the redundant transaction_audit_log table
DROP TABLE IF EXISTS transaction_audit_log CASCADE;

-- ============================================================================
-- ENSURE REQUIRED HELPER FUNCTIONS EXIST
-- ============================================================================

-- Create helper function to initialize user balance if it doesn't exist
CREATE OR REPLACE FUNCTION initialize_user_balance(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_balances (user_id, current_balance, version_number, last_transaction_at)
    SELECT user_uuid, COALESCE(p.coins, 0), 1, now()
    FROM profiles p
    WHERE p.id = user_uuid
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Create helper function to calculate refund amount
CREATE OR REPLACE FUNCTION calculate_refund_amount(created_at timestamptz, original_cost integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    minutes_since_creation integer;
BEGIN
    minutes_since_creation := EXTRACT(EPOCH FROM (now() - created_at)) / 60;
    
    -- 100% refund within 10 minutes, 80% after
    IF minutes_since_creation <= 10 THEN
        RETURN original_cost;
    ELSE
        RETURN FLOOR(original_cost * 0.8);
    END IF;
END;
$$;

-- Create helper function to check and update expired holds
CREATE OR REPLACE FUNCTION check_and_update_expired_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE videos 
    SET status = 'active', updated_at = now()
    WHERE status = 'on_hold' 
    AND hold_until <= now();
END;
$$;

-- ============================================================================
-- OPTIMIZED BALANCE MANAGEMENT (SINGLE SOURCE OF TRUTH)
-- ============================================================================

-- Simplified and optimized balance update function
CREATE OR REPLACE FUNCTION update_user_balance_atomic(
    user_uuid uuid,
    coin_amount integer,
    transaction_type_param text,
    description_param text,
    reference_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance integer;
    new_balance integer;
    current_version bigint;
    rows_affected integer;
    max_retries integer := 3;
    retry_count integer := 0;
BEGIN
    -- Ensure user balance record exists
    PERFORM initialize_user_balance(user_uuid);
    
    -- Retry loop for optimistic locking
    LOOP
        -- Get current balance and version with row lock
        SELECT ub.current_balance, ub.version_number 
        INTO current_balance, current_version
        FROM user_balances ub
        WHERE ub.user_id = user_uuid
        FOR UPDATE;
        
        -- Validate sufficient funds for debit transactions
        IF coin_amount < 0 AND current_balance + coin_amount < 0 THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Insufficient coins',
                'required', ABS(coin_amount),
                'available', current_balance
            );
        END IF;
        
        -- Calculate new balance
        new_balance := current_balance + coin_amount;
        
        -- Attempt atomic update with version check
        UPDATE user_balances 
        SET 
            current_balance = new_balance,
            version_number = current_version + 1,
            last_transaction_at = now(),
            updated_at = now()
        WHERE user_id = user_uuid 
        AND version_number = current_version;
        
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        
        -- If update succeeded, break out of retry loop
        IF rows_affected = 1 THEN
            EXIT;
        END IF;
        
        -- Handle optimistic locking conflict
        retry_count := retry_count + 1;
        IF retry_count >= max_retries THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Balance update failed due to concurrent modifications'
            );
        END IF;
        
        -- Brief pause before retry
        PERFORM pg_sleep(0.01 * retry_count);
    END LOOP;
    
    -- Update profiles table for backward compatibility
    UPDATE profiles 
    SET coins = new_balance, updated_at = now()
    WHERE id = user_uuid;
    
    -- Create single transaction record (no duplicate audit log)
    INSERT INTO coin_transactions (user_id, amount, transaction_type, description, reference_id)
    VALUES (user_uuid, coin_amount, transaction_type_param, description_param, reference_uuid);
    
    RETURN json_build_object(
        'success', true,
        'previous_balance', current_balance,
        'new_balance', new_balance,
        'amount_changed', coin_amount,
        'version', current_version + 1
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in update_user_balance_atomic for user %: %', user_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- FILTERED TRANSACTION HISTORY (EXCLUDE VIDEO_WATCH)
-- ============================================================================

-- Get filtered transaction history excluding video_watch rewards
CREATE OR REPLACE FUNCTION get_user_transaction_history(
    user_uuid uuid,
    limit_count integer DEFAULT 50,
    offset_count integer DEFAULT 0
)
RETURNS TABLE(
    id uuid,
    amount integer,
    transaction_type text,
    description text,
    reference_id uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ct.id,
        ct.amount,
        ct.transaction_type,
        ct.description,
        ct.reference_id,
        ct.created_at
    FROM coin_transactions ct
    WHERE ct.user_id = user_uuid
        -- EXCLUDE video_watch transactions from user-facing history
        AND ct.transaction_type IN (
            'video_promotion', 
            'purchase', 
            'referral_bonus', 
            'admin_adjustment', 
            'vip_purchase', 
            'ad_stop_purchase',
            'video_deletion_refund'
        )
    ORDER BY ct.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;

-- ============================================================================
-- DUPLICATE PREVENTION FOR COIN REWARDS
-- ============================================================================

-- Enhanced coin award function with duplicate prevention
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
BEGIN
    -- Get video details with row lock to prevent race conditions
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid
    FOR UPDATE;
    
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
    
    -- CRITICAL: Check for existing completed view to prevent duplicates
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RETURN json_build_object('success', false, 'error', 'Already completed this video');
    END IF;
    
    -- ADDITIONAL: Check for duplicate coin transactions for this video
    SELECT COUNT(*) INTO duplicate_check
    FROM coin_transactions 
    WHERE user_id = user_uuid 
        AND reference_id = video_uuid 
        AND transaction_type = 'video_watch';
    
    IF duplicate_check > 0 THEN
        RETURN json_build_object('success', false, 'error', 'Coins already awarded for this video');
    END IF;
    
    -- Validate sufficient watch time
    IF watch_duration < video_record.duration_seconds THEN
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
        completed = true,
        coins_earned = EXCLUDED.coins_earned,
        created_at = now();
    
    -- Award coins using optimized balance system
    SELECT update_user_balance_atomic(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Completed watching: ' || video_record.title,
        video_uuid
    ) INTO balance_result;
    
    IF NOT (balance_result->>'success')::boolean THEN
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
    
    RETURN json_build_object(
        'success', true,
        'coins_earned', coins_to_award,
        'new_balance', (balance_result->>'new_balance')::integer,
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_optimized: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- OPTIMIZED VIDEO CREATION
-- ============================================================================

-- Streamlined video creation function
CREATE OR REPLACE FUNCTION create_video_optimized(
    coin_cost_param integer,
    coin_reward_param integer,
    duration_seconds_param integer,
    target_views_param integer,
    title_param text,
    user_uuid uuid,
    youtube_url_param text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    video_id uuid;
    balance_result json;
BEGIN
    -- Validate parameters
    IF coin_cost_param <= 0 OR coin_reward_param <= 0 THEN
        RAISE EXCEPTION 'Coin amounts must be positive';
    END IF;
    
    IF duration_seconds_param < 10 OR duration_seconds_param > 600 THEN
        RAISE EXCEPTION 'Duration must be between 10 and 600 seconds';
    END IF;
    
    IF target_views_param <= 0 OR target_views_param > 1000 THEN
        RAISE EXCEPTION 'Target views must be between 1 and 1000';
    END IF;
    
    IF LENGTH(TRIM(title_param)) < 5 THEN
        RAISE EXCEPTION 'Title must be at least 5 characters long';
    END IF;
    
    -- Deduct coins using optimized balance system
    SELECT update_user_balance_atomic(
        user_uuid,
        -coin_cost_param,
        'video_promotion',
        'Promoted video: ' || title_param
    ) INTO balance_result;
    
    IF NOT (balance_result->>'success')::boolean THEN
        RAISE EXCEPTION '%', balance_result->>'error';
    END IF;
    
    -- Create video with 10-minute hold period
    INSERT INTO videos (
        user_id, youtube_url, title, duration_seconds,
        coin_cost, coin_reward, target_views, 
        status, hold_until, created_at, updated_at
    )
    VALUES (
        user_uuid, youtube_url_param, TRIM(title_param), duration_seconds_param,
        coin_cost_param, coin_reward_param, target_views_param, 
        'on_hold', now() + interval '10 minutes', now(), now()
    )
    RETURNING id INTO video_id;
    
    RETURN video_id;
END;
$$;

-- ============================================================================
-- OPTIMIZED VIDEO DELETION
-- ============================================================================

-- Streamlined video deletion with refund
CREATE OR REPLACE FUNCTION delete_video_optimized(
    video_uuid uuid,
    user_uuid uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    video_record videos%ROWTYPE;
    refund_amount integer;
    refund_percentage integer;
    views_deleted_count integer := 0;
    minutes_since_creation integer;
    balance_result json;
BEGIN
    -- Get video details with row lock
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid
    FOR UPDATE;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Video not found or access denied');
    END IF;
    
    -- Calculate refund
    refund_amount := calculate_refund_amount(video_record.created_at, video_record.coin_cost);
    minutes_since_creation := EXTRACT(EPOCH FROM (now() - video_record.created_at)) / 60;
    refund_percentage := CASE WHEN minutes_since_creation <= 10 THEN 100 ELSE 80 END;
    
    -- Delete video views first
    DELETE FROM video_views WHERE video_id = video_uuid;
    GET DIAGNOSTICS views_deleted_count = ROW_COUNT;
    
    -- Delete the video
    DELETE FROM videos WHERE id = video_uuid AND user_id = user_uuid;
    
    -- Process refund using optimized balance system
    IF refund_amount > 0 THEN
        SELECT update_user_balance_atomic(
            user_uuid,
            refund_amount,
            'video_deletion_refund',
            format('Refund for deleted video: %s (%s%% refund)', video_record.title, refund_percentage),
            video_uuid
        ) INTO balance_result;
        
        IF NOT (balance_result->>'success')::boolean THEN
            RAISE LOG 'Refund failed for video deletion: %', balance_result->>'error';
        END IF;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'video_id', video_uuid,
        'title', video_record.title,
        'original_cost', video_record.coin_cost,
        'refund_amount', refund_amount,
        'refund_percentage', refund_percentage,
        'views_deleted', views_deleted_count,
        'new_balance', COALESCE((balance_result->>'new_balance')::integer, 0),
        'message', format('Video deleted successfully. %s coins refunded (%s%%)', refund_amount, refund_percentage)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in delete_video_optimized: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- ANALYTICS WITH FILTERED TRANSACTIONS
-- ============================================================================

-- Updated analytics function excluding video_watch from earnings calculation
CREATE OR REPLACE FUNCTION get_user_analytics_summary_fixed(user_uuid uuid)
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
    -- Auto-update expired holds before returning analytics
    PERFORM check_and_update_expired_holds();
    
    RETURN QUERY
    SELECT 
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid), 0),
        -- Only count non-video_watch earnings for user-facing analytics
        COALESCE((
            SELECT SUM(ct.amount)::integer 
            FROM coin_transactions ct 
            WHERE ct.user_id = user_uuid 
            AND ct.amount > 0 
            AND ct.transaction_type IN (
                'purchase', 'referral_bonus', 'admin_adjustment', 
                'vip_purchase', 'video_deletion_refund'
            )
        ), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'active'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'completed'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'on_hold'), 0);
END;
$$;

-- ============================================================================
-- CLEANUP INDEXES FOR DROPPED TABLE
-- ============================================================================

-- Remove indexes that were created for the dropped transaction_audit_log table
DROP INDEX IF EXISTS idx_transaction_audit_user_type;
DROP INDEX IF EXISTS idx_transaction_audit_reference;
DROP INDEX IF EXISTS idx_transaction_audit_created_at;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users for active functions only
GRANT EXECUTE ON FUNCTION initialize_user_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_refund_amount(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_update_expired_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_balance_atomic(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_transaction_history(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION award_coins_optimized(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION create_video_optimized(integer, integer, integer, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_video_optimized(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_analytics_summary_fixed(uuid) TO authenticated;

-- ============================================================================
-- ADD MISSING CONSTRAINT IF NEEDED
-- ============================================================================

-- Ensure unique constraint exists on video_views to prevent duplicate views
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'video_views_video_viewer_unique' 
        AND table_name = 'video_views'
    ) THEN
        ALTER TABLE video_views 
        ADD CONSTRAINT video_views_video_viewer_unique 
        UNIQUE (video_id, viewer_id);
    END IF;
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 Comprehensive Database Cleanup Completed Successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '🗑️ Removed Components:';
    RAISE NOTICE '  ✓ Dropped transaction_audit_log table (redundant)';
    RAISE NOTICE '  ✓ Removed duplicate/unused functions';
    RAISE NOTICE '  ✓ Cleaned up redundant triggers and indexes';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Fixed Issues:';
    RAISE NOTICE '  ✓ Fixed function signature conflicts';
    RAISE NOTICE '  ✓ Prevented duplicate coin rewards';
    RAISE NOTICE '  ✓ Filtered video_watch from transaction history';
    RAISE NOTICE '  ✓ Optimized database calls and performance';
    RAISE NOTICE '  ✓ Maintained user_balances for fast lookups';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Transaction History Now Shows:';
    RAISE NOTICE '  ✓ Video promotions';
    RAISE NOTICE '  ✓ VIP purchases';
    RAISE NOTICE '  ✓ Coin purchases';
    RAISE NOTICE '  ✓ Referral earnings';
    RAISE NOTICE '  ✓ Admin adjustments';
    RAISE NOTICE '  ✓ Video deletion refunds';
    RAISE NOTICE '  ❌ Video watch rewards (hidden from user)';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 System Optimizations:';
    RAISE NOTICE '  ✓ Single source of truth for transactions';
    RAISE NOTICE '  ✓ Reduced database calls';
    RAISE NOTICE '  ✓ Improved concurrent user handling';
    RAISE NOTICE '  ✓ Enhanced duplicate prevention';
    RAISE NOTICE '  ✓ Added missing helper functions';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Database is now optimized and ready for production!';
END $$;