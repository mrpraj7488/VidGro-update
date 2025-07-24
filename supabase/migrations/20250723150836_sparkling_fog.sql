/*
  # Fix create_video_with_hold Function Parameter Order
  
  This migration fixes the parameter order mismatch in the create_video_with_hold function
  to match what the application code expects.
  
  1. Changes
    - Drop existing create_video_with_hold function
    - Recreate with correct parameter order matching the application code
    - Ensure all parameter names and types are correct
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS create_video_with_hold(uuid, text, text, integer, integer, integer, integer);

-- Recreate the function with the correct parameter order that matches the application code
CREATE OR REPLACE FUNCTION create_video_with_hold(
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
    
    -- Create video with hold
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
    RAISE NOTICE 'create_video_with_hold function recreated with correct parameter order.';
    RAISE NOTICE 'Function now matches the application code expectations.';
END $$;