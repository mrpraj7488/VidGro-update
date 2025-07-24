/*
  # Fix Analytics Backend Logic and Database Functions
  
  This migration fixes several issues with the analytics system:
  1. Automatic video activation after hold period
  2. Remove coin reward display from frontend (backend only)
  3. Simplify analytics to show only videos promoted and coins earned
  4. Replace performance insights with recent activity (excluding reward transactions)
  5. Clean up duplicate code and improve functions
*/

-- ============================================================================
-- IMPROVED ANALYTICS FUNCTIONS
-- ============================================================================

-- Drop existing analytics function and create improved version
DROP FUNCTION IF EXISTS get_user_analytics_summary(uuid);

CREATE OR REPLACE FUNCTION get_user_analytics_summary(user_uuid uuid)
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
    RETURN QUERY
    SELECT 
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid), 0),
        COALESCE((SELECT SUM(ct.amount)::integer FROM coin_transactions ct WHERE ct.user_id = user_uuid AND ct.amount > 0 AND ct.transaction_type != 'video_watch'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'active'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'completed'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'on_hold'), 0);
END;
$$;

-- Create function for recent activity (excluding video_watch rewards)
CREATE OR REPLACE FUNCTION get_recent_activity(
    user_uuid uuid,
    activity_limit integer DEFAULT 10
)
RETURNS TABLE(
    id uuid,
    amount integer,
    transaction_type text,
    description text,
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
        ct.created_at
    FROM coin_transactions ct
    WHERE ct.user_id = user_uuid
        AND ct.transaction_type IN ('video_promotion', 'purchase', 'referral_bonus', 'admin_adjustment', 'vip_purchase', 'ad_stop_purchase')
    ORDER BY ct.created_at DESC
    LIMIT activity_limit;
END;
$$;

-- Improved video hold release function with automatic activation
CREATE OR REPLACE FUNCTION release_videos_from_hold_improved()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    released_count integer := 0;
    video_record RECORD;
BEGIN
    -- Get all videos that should be released from hold
    FOR video_record IN 
        SELECT id, user_id, title
        FROM videos 
        WHERE status = 'on_hold' 
        AND hold_until <= now()
    LOOP
        -- Update video status to active
        UPDATE videos 
        SET 
            status = 'active',
            updated_at = now(),
            hold_until = NULL
        WHERE id = video_record.id;
        
        released_count := released_count + 1;
        
        -- Log the release
        RAISE LOG 'Video % released from hold for user %', video_record.id, video_record.user_id;
    END LOOP;
    
    RETURN released_count;
END;
$$;

-- Function to automatically manage video statuses
CREATE OR REPLACE FUNCTION auto_manage_video_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    released_count integer := 0;
    completed_count integer := 0;
    total_updated_count integer := 0;
BEGIN
    -- Release videos from hold
    released_count := release_videos_from_hold_improved();
    
    -- Mark completed videos
    UPDATE videos 
    SET 
        status = 'completed',
        updated_at = now()
    WHERE status = 'active' 
    AND views_count >= target_views;
    
    GET DIAGNOSTICS completed_count = ROW_COUNT;
    
    -- Calculate total updated count
    total_updated_count := released_count + completed_count;
    
    RETURN total_updated_count;
END;
$$;

-- Improved video analytics function without coin reward display
CREATE OR REPLACE FUNCTION get_video_analytics_clean(
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
    completion_percentage decimal(5,2);
BEGIN
    -- Get fresh video data
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('error', 'Video not found');
    END IF;
    
    -- Calculate completion percentage
    completion_percentage := CASE 
        WHEN video_record.target_views > 0 THEN 
            ROUND((video_record.views_count::decimal / video_record.target_views::decimal) * 100, 2)
        ELSE 0
    END;
    
    -- Return clean analytics data (no coin_reward)
    result := json_build_object(
        'id', video_record.id,
        'title', video_record.title,
        'views_count', video_record.views_count,
        'target_views', video_record.target_views,
        'status', video_record.status,
        'coin_cost', video_record.coin_cost,
        'completion_rate', completion_percentage,
        'progress_text', video_record.views_count || '/' || video_record.target_views,
        'created_at', video_record.created_at,
        'updated_at', video_record.updated_at,
        'hold_until', video_record.hold_until
    );
    
    RETURN result;
END;
$$;

-- ============================================================================
-- AUTOMATIC VIDEO STATUS MANAGEMENT
-- ============================================================================

-- Create function to be called by cron or trigger
CREATE OR REPLACE FUNCTION process_video_queue_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    processed_count integer;
BEGIN
    -- Auto-manage video statuses
    processed_count := auto_manage_video_statuses();
    
    -- Log maintenance activity
    IF processed_count > 0 THEN
        RAISE LOG 'Video queue maintenance processed % videos', processed_count;
    END IF;
END;
$$;

-- ============================================================================
-- IMPROVED COIN TRANSACTION FUNCTIONS
-- ============================================================================

-- Improved update_user_coins function with better error handling
CREATE OR REPLACE FUNCTION update_user_coins_improved(
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
    result json;
BEGIN
    -- Get current balance with row lock
    SELECT coins INTO current_balance 
    FROM profiles 
    WHERE id = user_uuid 
    FOR UPDATE;
    
    -- Check if user exists
    IF current_balance IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Check for sufficient funds on debit transactions
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
    
    -- Update user balance
    UPDATE profiles 
    SET coins = new_balance, updated_at = now()
    WHERE id = user_uuid;
    
    -- Record transaction
    INSERT INTO coin_transactions (user_id, amount, transaction_type, description, reference_id)
    VALUES (user_uuid, coin_amount, transaction_type_param, description_param, reference_uuid);
    
    -- Return success result
    result := json_build_object(
        'success', true,
        'previous_balance', current_balance,
        'new_balance', new_balance,
        'amount_changed', coin_amount
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in update_user_coins_improved for user %: % (SQLSTATE: %)', user_uuid, SQLERRM, SQLSTATE;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC VIDEO MANAGEMENT
-- ============================================================================

-- Function to automatically release videos from hold
CREATE OR REPLACE FUNCTION trigger_auto_release_videos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only process if this is an update that might affect hold status
    IF TG_OP = 'UPDATE' AND OLD.status = 'on_hold' AND NEW.status = 'on_hold' THEN
        -- Check if hold period has expired
        IF NEW.hold_until IS NOT NULL AND NEW.hold_until <= now() THEN
            NEW.status := 'active';
            NEW.hold_until := NULL;
            NEW.updated_at := now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for automatic video release
DROP TRIGGER IF EXISTS auto_release_videos_trigger ON videos;
CREATE TRIGGER auto_release_videos_trigger
    BEFORE UPDATE ON videos
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_release_videos();

-- ============================================================================
-- CLEANUP AND OPTIMIZATION
-- ============================================================================

-- Drop old functions that are no longer needed
DROP FUNCTION IF EXISTS get_filtered_recent_activities(uuid, integer);
DROP FUNCTION IF EXISTS get_video_analytics_realtime_v2(uuid, uuid);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_hold_status_time ON videos(status, hold_until) WHERE status = 'on_hold';
CREATE INDEX IF NOT EXISTS idx_coin_transactions_activity ON coin_transactions(user_id, transaction_type, created_at) WHERE transaction_type != 'video_watch';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_analytics_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_activity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_video_analytics_clean(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_coins_improved(uuid, integer, text, text, uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Analytics backend improvements completed successfully!';
    RAISE NOTICE '✓ Automatic video activation after hold period';
    RAISE NOTICE '✓ Simplified analytics (videos promoted + coins earned only)';
    RAISE NOTICE '✓ Recent activity function (excluding reward transactions)';
    RAISE NOTICE '✓ Improved error handling and performance';
    RAISE NOTICE '✓ Removed duplicate code and optimized functions';
END $$;