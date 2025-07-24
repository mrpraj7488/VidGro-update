/*
  # Add Filtered Recent Activities Function
  
  This migration adds a function to get filtered recent activities for cleaner activity feeds.
  
  1. New Functions
    - get_filtered_recent_activities: Returns filtered coin transactions excluding video_watch for cleaner feeds
  
  2. Features
    - Excludes video_watch transactions to reduce noise
    - Includes video_promotion, purchase, referral_bonus, admin_adjustment
    - Configurable limit parameter
    - Optimized for performance
*/

-- Create function to get filtered recent activities
CREATE OR REPLACE FUNCTION get_filtered_recent_activities(
    user_uuid uuid,
    activity_limit integer DEFAULT 20
)
RETURNS TABLE(
    id uuid,
    user_id uuid,
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
        ct.user_id,
        ct.amount,
        ct.transaction_type,
        ct.description,
        ct.reference_id,
        ct.created_at
    FROM coin_transactions ct
    WHERE ct.user_id = user_uuid
        AND ct.transaction_type IN ('video_promotion', 'purchase', 'referral_bonus', 'admin_adjustment', 'vip_purchase', 'ad_stop_purchase')
    ORDER BY ct.created_at DESC
    LIMIT activity_limit;
END;
$$;

-- Create function to get video analytics with real-time data
CREATE OR REPLACE FUNCTION get_video_analytics_realtime_v2(
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
BEGIN
    -- Get fresh video data
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('error', 'Video not found');
    END IF;
    
    -- Return fresh analytics data
    result := json_build_object(
        'id', video_record.id,
        'views_count', video_record.views_count,
        'target_views', video_record.target_views,
        'status', video_record.status,
        'total_watch_time', video_record.total_watch_time,
        'completion_rate', ROUND((video_record.views_count::decimal / video_record.target_views::decimal) * 100, 2),
        'progress_text', video_record.views_count || '/' || video_record.target_views,
        'fresh_data', true,
        'updated_at', video_record.updated_at
    );
    
    RETURN result;
END;
$$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Filtered activities function created successfully.';
    RAISE NOTICE 'Real-time video analytics function created successfully.';
END $$;