/*
  # Final Fix for create_video_with_hold Function
  
  This migration ensures the create_video_with_hold function exists with the exact
  parameter signature that matches the application code expectations.
  
  1. Drop any existing versions of the function
  2. Create the function with the correct parameter order
  3. Ensure all parameters are properly named and typed
*/

-- Drop all existing versions of the function
DROP FUNCTION IF EXISTS create_video_with_hold(uuid, text, text, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS create_video_with_hold(integer, integer, integer, integer, text, uuid, text);

-- Create the function with the exact signature expected by the application
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
    -- Validate input parameters
    IF coin_cost_param <= 0 THEN
        RAISE EXCEPTION 'Coin cost must be positive';
    END IF;
    
    IF coin_reward_param <= 0 THEN
        RAISE EXCEPTION 'Coin reward must be positive';
    END IF;
    
    IF duration_seconds_param < 10 OR duration_seconds_param > 600 THEN
        RAISE EXCEPTION 'Duration must be between 10 and 600 seconds';
    END IF;
    
    IF target_views_param <= 0 OR target_views_param > 1000 THEN
        RAISE EXCEPTION 'Target views must be between 1 and 1000';
    END IF;
    
    IF title_param IS NULL OR LENGTH(TRIM(title_param)) < 5 THEN
        RAISE EXCEPTION 'Title must be at least 5 characters long';
    END IF;
    
    IF youtube_url_param IS NULL OR LENGTH(TRIM(youtube_url_param)) = 0 THEN
        RAISE EXCEPTION 'YouTube URL is required';
    END IF;

    -- Check user exists and get balance
    SELECT coins INTO user_balance 
    FROM profiles 
    WHERE id = user_uuid;
    
    IF user_balance IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    IF user_balance < coin_cost_param THEN
        RAISE EXCEPTION 'Insufficient coins. Required: %, Available: %', coin_cost_param, user_balance;
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
    
    -- Create video with hold period
    INSERT INTO videos (
        user_id, 
        youtube_url, 
        title, 
        duration_seconds,
        coin_cost, 
        coin_reward, 
        target_views, 
        status, 
        hold_until,
        created_at,
        updated_at
    )
    VALUES (
        user_uuid, 
        youtube_url_param, 
        TRIM(title_param), 
        duration_seconds_param,
        coin_cost_param, 
        coin_reward_param, 
        target_views_param, 
        'on_hold', 
        now() + interval '10 minutes',
        now(),
        now()
    )
    RETURNING id INTO video_id;
    
    -- Log the creation
    RAISE LOG 'Video created successfully: % for user: %', video_id, user_uuid;
    
    RETURN video_id;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error for debugging
        RAISE LOG 'Error in create_video_with_hold: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        -- Re-raise the exception
        RAISE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_video_with_hold(integer, integer, integer, integer, text, uuid, text) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'create_video_with_hold function created successfully with signature:';
    RAISE NOTICE 'create_video_with_hold(coin_cost_param, coin_reward_param, duration_seconds_param, target_views_param, title_param, user_uuid, youtube_url_param)';
END $$;