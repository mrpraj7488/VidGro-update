/*
  # Fix Description Column Error
  
  This migration removes the description parameter from the create_video_with_hold function
  since the videos table doesn't have a description column.
  
  1. Changes
    - Update create_video_with_hold function to remove description parameter
    - Remove description from INSERT statement
    - Clean up function signature
*/

-- Drop and recreate the function without description parameter
DROP FUNCTION IF EXISTS create_video_with_hold(uuid, text, text, text, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION create_video_with_hold(
    user_uuid uuid,
    youtube_url_param text,
    title_param text,
    duration_seconds_param integer,
    coin_cost_param integer,
    coin_reward_param integer,
    target_views_param integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    video_id uuid;
    user_balance integer;
BEGIN
    -- Check user balance
    SELECT coins INTO user_balance FROM profiles WHERE id = user_uuid;
    
    IF user_balance < coin_cost_param THEN
        RAISE EXCEPTION 'Insufficient coins';
    END IF;
    
    -- Deduct coins from user
    IF NOT update_user_coins(
        user_uuid,
        -coin_cost_param,
        'video_promotion',
        'Promoted video: ' || title_param
    ) THEN
        RAISE EXCEPTION 'Failed to deduct coins';
    END IF;
    
    -- Create video with hold (without description column)
    INSERT INTO videos (
        user_id, youtube_url, title, duration_seconds,
        coin_cost, coin_reward, target_views, status, hold_until
    )
    VALUES (
        user_uuid, youtube_url_param, title_param, duration_seconds_param,
        coin_cost_param, coin_reward_param, target_views_param, 'on_hold', 
        now() + interval '10 minutes'
    )
    RETURNING id INTO video_id;
    
    RETURN video_id;
END;
$$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'create_video_with_hold function updated - description parameter removed.';
END $$;