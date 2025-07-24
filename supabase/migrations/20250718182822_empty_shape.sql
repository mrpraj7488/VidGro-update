/*
  # Fix Ambiguous Column Reference in Analytics Function
  
  This migration fixes the ambiguous column reference error in the get_user_analytics_summary function.
  The error occurs because 'total_watch_time' could refer to either a table column or a variable.
  
  1. Changes
    - Update get_user_analytics_summary function to use fully qualified column names
    - Add table aliases to prevent ambiguity
    - Ensure all column references are explicit
*/

-- Drop and recreate the function with proper column qualification
DROP FUNCTION IF EXISTS get_user_analytics_summary(uuid);

CREATE OR REPLACE FUNCTION get_user_analytics_summary(user_uuid uuid)
RETURNS TABLE(
    total_videos_promoted integer,
    total_coins_earned integer,
    total_coins_spent integer,
    total_views_received integer,
    total_watch_time integer,
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
        COALESCE((SELECT SUM(ct.amount)::integer FROM coin_transactions ct WHERE ct.user_id = user_uuid AND ct.amount > 0), 0),
        COALESCE((SELECT ABS(SUM(ct.amount))::integer FROM coin_transactions ct WHERE ct.user_id = user_uuid AND ct.amount < 0), 0),
        COALESCE((SELECT SUM(v.views_count)::integer FROM videos v WHERE v.user_id = user_uuid), 0),
        COALESCE((SELECT SUM(v.total_watch_time)::integer FROM videos v WHERE v.user_id = user_uuid), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'active'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'completed'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'on_hold'), 0);
END;
$$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Analytics function updated successfully - ambiguous column reference fixed.';
END $$;