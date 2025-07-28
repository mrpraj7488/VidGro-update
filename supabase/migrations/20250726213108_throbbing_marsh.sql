/*
  # Simplify Coin System - Remove user_balances Dependencies
  
  This migration creates simplified functions that work without the user_balances table
  and removes all duplicate prevention checks to allow multiple coin rewards.
  
  ## Changes Made
  1. Create simple coin update function that works directly with profiles table
  2. Remove all duplicate prevention checks
  3. Simplify video creation and deletion functions
  4. Clean up unused functions
*/

-- ============================================================================
-- DROP ALL FUNCTIONS THAT DEPEND ON user_balances TABLE
-- ============================================================================

-- Drop all functions that reference user_balances or have duplicate prevention
DROP FUNCTION IF EXISTS initialize_user_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS update_user_balance_atomic(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_balance_fast(uuid) CASCADE;
DROP FUNCTION IF EXISTS award_coins_optimized_fixed(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS award_coins_optimized(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS create_video_optimized(integer, integer, integer, integer, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS delete_video_optimized(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS process_video_completion(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS reset_video_reward_status(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS check_duplicate_rewards(uuid) CASCADE;

-- Drop any remaining user_balances related functions
DROP FUNCTION IF EXISTS sync_profile_balance_to_user_balances() CASCADE;
DROP FUNCTION IF EXISTS migrate_coin_transactions_to_balances() CASCADE;
DROP FUNCTION IF EXISTS validate_balance_migration() CASCADE;
DROP FUNCTION IF EXISTS get_balance_system_metrics() CASCADE;

-- ============================================================================
-- SIMPLIFIED COIN TRANSACTION SYSTEM (NO DUPLICATE PREVENTION)
-- ============================================================================

-- Simple coin update function that works directly with profiles table
CREATE OR REPLACE FUNCTION update_user_coins_simple(
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
BEGIN
    -- Get current balance from profiles table
    SELECT coins INTO current_balance 
    FROM profiles 
    WHERE id = user_uuid;
    
    IF current_balance IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- For debit transactions, check if user has sufficient funds
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
    
    -- Update user balance in profiles table
    UPDATE profiles 
    SET coins = new_balance, updated_at = now()
    WHERE id = user_uuid;
    
    -- Create transaction record
    INSERT INTO coin_transactions (user_id, amount, transaction_type, description, reference_id)
    VALUES (user_uuid, coin_amount, transaction_type_param, description_param, reference_uuid);
    
    RETURN json_build_object(
        'success', true,
        'previous_balance', current_balance,
        'new_balance', new_balance,
        'amount_changed', coin_amount
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in update_user_coins_simple for user %: %', user_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- SIMPLIFIED VIDEO CREATION (NO user_balances DEPENDENCY)
-- ============================================================================

-- Simplified video creation function
CREATE OR REPLACE FUNCTION create_video_simple(
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
    coin_result json;
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
    
    -- Deduct coins using simple coin system
    SELECT update_user_coins_simple(
        user_uuid,
        -coin_cost_param,
        'video_promotion',
        'Promoted video: ' || title_param
    ) INTO coin_result;
    
    IF NOT (coin_result->>'success')::boolean THEN
        RAISE EXCEPTION '%', coin_result->>'error';
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
-- SIMPLIFIED VIDEO DELETION (NO user_balances DEPENDENCY)
-- ============================================================================

-- Simplified video deletion with refund
CREATE OR REPLACE FUNCTION delete_video_simple(
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
    coin_result json;
BEGIN
    -- Get video details
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid;
    
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
    
    -- Process refund using simple coin system
    IF refund_amount > 0 THEN
        SELECT update_user_coins_simple(
            user_uuid,
            refund_amount,
            'video_deletion_refund',
            format('Refund for deleted video: %s (%s%% refund)', video_record.title, refund_percentage),
            video_uuid
        ) INTO coin_result;
        
        IF NOT (coin_result->>'success')::boolean THEN
            RAISE LOG 'Refund failed for video deletion: %', coin_result->>'error';
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
        'new_balance', COALESCE((coin_result->>'new_balance')::integer, 0),
        'message', format('Video deleted successfully. %s coins refunded (%s%%)', refund_amount, refund_percentage)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in delete_video_simple: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_user_coins_simple(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_video_simple(integer, integer, integer, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_video_simple(uuid, uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 Coin System Simplified Successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '🗑️ Removed Components:';
    RAISE NOTICE '  ✓ All user_balances table dependencies';
    RAISE NOTICE '  ✓ Duplicate prevention checks';
    RAISE NOTICE '  ✓ Complex optimistic locking system';
    RAISE NOTICE '  ✓ Unused balance management functions';
    RAISE NOTICE '';
    RAISE NOTICE '✨ New Simple Functions:';
    RAISE NOTICE '  ✓ update_user_coins_simple() - Direct profile updates';
    RAISE NOTICE '  ✓ create_video_simple() - Simplified video creation';
    RAISE NOTICE '  ✓ delete_video_simple() - Simplified video deletion';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 System Benefits:';
    RAISE NOTICE '  ✓ No duplicate prevention - allows multiple rewards';
    RAISE NOTICE '  ✓ Direct profile table updates';
    RAISE NOTICE '  ✓ Simplified transaction recording';
    RAISE NOTICE '  ✓ Reduced complexity and overhead';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Coin system is now simplified and ready!';
END $$;