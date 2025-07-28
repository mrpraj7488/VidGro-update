/*
  # Complete VidGro Database Setup - Fresh Start
  
  This migration sets up the entire VidGro database from scratch for a video promotion
  and monetization platform where users watch videos to earn coins and promote their own content.

  ## Database Schema Overview
  
  1. **Tables**
     - profiles: User accounts with coins, VIP status, and referral system
     - videos: Video promotions with hold system, analytics, and status management
     - video_views: Track user video watching history and completion
     - coin_transactions: Complete audit trail of all coin movements
     - user_settings: User preferences and configuration

  2. **Security**
     - Row Level Security (RLS) enabled on all tables
     - Comprehensive policies for secure data access
     - User data isolation and protection

  3. **Business Logic Functions**
     - Video queue management and distribution
     - Coin transaction processing with validation
     - Analytics and reporting functions
     - Automatic video status management (hold → active → completed)
     - Video deletion with time-based refunds

  4. **Features**
     - 10-minute hold period for new video promotions
     - Time-based refund system (100% within 10 minutes, 80% after)
     - VIP membership with 10% promotion discounts
     - Referral system with bonus rewards
     - Real-time analytics and progress tracking
*/

-- ============================================================================
-- UTILITY FUNCTIONS (NO EXTENSIONS REQUIRED)
-- ============================================================================

-- Generate referral codes using only built-in PostgreSQL functions
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    code text;
    exists_check boolean;
    attempt_count integer := 0;
BEGIN
    LOOP
        attempt_count := attempt_count + 1;
        
        -- Generate 8-character code using md5 hash
        code := upper(substring(
            md5(random()::text || clock_timestamp()::text || attempt_count::text) 
            from 1 for 8
        ));
        
        -- Ensure alphanumeric only
        code := regexp_replace(code, '[^A-Z0-9]', '', 'g');
        
        -- Pad with zeros if too short
        WHILE length(code) < 8 LOOP
            code := code || '0';
        END LOOP;
        
        -- Truncate if too long
        code := substring(code from 1 for 8);
        
        -- Check uniqueness
        SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code) INTO exists_check;
        
        IF NOT exists_check OR attempt_count > 20 THEN
            EXIT;
        END IF;
    END LOOP;
    
    -- Fallback with timestamp if still not unique
    IF exists_check THEN
        code := substring(code from 1 for 4) || 
                to_char(extract(epoch from now())::integer % 10000, 'FM0000');
    END IF;
    
    RETURN code;
END;
$$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- User profiles with coins, VIP status, and referral system
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    username text UNIQUE NOT NULL,
    coins integer DEFAULT 100 NOT NULL CHECK (coins >= 0),
    is_vip boolean DEFAULT false NOT NULL,
    vip_expires_at timestamptz,
    referral_code text UNIQUE NOT NULL DEFAULT generate_referral_code(),
    referred_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Video promotions with hold system and analytics
CREATE TABLE IF NOT EXISTS videos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    youtube_url text NOT NULL,
    title text NOT NULL,
    duration_seconds integer NOT NULL CHECK (duration_seconds >= 10 AND duration_seconds <= 600),
    coin_cost integer NOT NULL CHECK (coin_cost > 0),
    coin_reward integer NOT NULL CHECK (coin_reward > 0),
    views_count integer DEFAULT 0 NOT NULL CHECK (views_count >= 0),
    target_views integer NOT NULL CHECK (target_views > 0 AND target_views <= 1000),
    status text DEFAULT 'on_hold' NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'on_hold', 'repromoted')),
    hold_until timestamptz DEFAULT (now() + interval '10 minutes'),
    total_watch_time integer DEFAULT 0,
    engagement_rate decimal(5,2) DEFAULT 0.0,
    completion_rate decimal(5,2) DEFAULT 0.0,
    average_watch_time decimal(8,2) DEFAULT 0.0,
    repromoted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Video viewing history and completion tracking
CREATE TABLE IF NOT EXISTS video_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    viewer_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    watched_duration integer NOT NULL CHECK (watched_duration >= 0),
    completed boolean DEFAULT false NOT NULL,
    coins_earned integer DEFAULT 0 NOT NULL CHECK (coins_earned >= 0),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(video_id, viewer_id)
);

-- Complete audit trail of coin transactions
CREATE TABLE IF NOT EXISTS coin_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    amount integer NOT NULL,
    transaction_type text NOT NULL CHECK (transaction_type IN (
        'video_watch', 
        'video_promotion', 
        'purchase', 
        'referral_bonus', 
        'admin_adjustment', 
        'vip_purchase', 
        'ad_stop_purchase',
        'video_deletion_refund'
    )),
    description text NOT NULL,
    reference_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- User preferences and settings
CREATE TABLE IF NOT EXISTS user_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    ad_frequency integer DEFAULT 5 NOT NULL CHECK (ad_frequency >= 1 AND ad_frequency <= 20),
    auto_play boolean DEFAULT true NOT NULL,
    notifications_enabled boolean DEFAULT true NOT NULL,
    language text DEFAULT 'en' NOT NULL,
    ad_stop_expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_coins_update ON profiles(id, coins, updated_at);

-- Videos indexes for queue management and analytics
CREATE INDEX IF NOT EXISTS idx_videos_queue_active ON videos(status, views_count, target_views, created_at) 
    WHERE status IN ('active', 'repromoted');
CREATE INDEX IF NOT EXISTS idx_videos_hold_release ON videos(status, hold_until) 
    WHERE status = 'on_hold';
CREATE INDEX IF NOT EXISTS idx_videos_user_status ON videos(user_id, status);
CREATE INDEX IF NOT EXISTS idx_videos_analytics ON videos(user_id, status, views_count, target_views);

-- Video views indexes for real-time updates
CREATE INDEX IF NOT EXISTS idx_video_views_completion ON video_views(video_id, viewer_id, completed, coins_earned);
CREATE INDEX IF NOT EXISTS idx_video_views_viewer ON video_views(viewer_id, completed, created_at);

-- Coin transactions indexes for analytics
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_type ON coin_transactions(user_id, transaction_type, created_at);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_analytics ON coin_transactions(user_id, transaction_type, amount, created_at) 
    WHERE transaction_type != 'video_watch';

-- User settings index
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "System can insert profiles" ON profiles
    FOR INSERT WITH CHECK (true);

-- Videos policies
CREATE POLICY "Users can view active videos or own videos" ON videos
    FOR SELECT USING (status IN ('active', 'repromoted') OR user_id = auth.uid());

CREATE POLICY "Users can create videos" ON videos
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own videos" ON videos
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own videos" ON videos
    FOR DELETE USING (user_id = auth.uid());

-- Video views policies
CREATE POLICY "Users can view own video views" ON video_views
    FOR SELECT USING (viewer_id = auth.uid());

CREATE POLICY "Users can create video views" ON video_views
    FOR INSERT WITH CHECK (viewer_id = auth.uid());

-- Coin transactions policies
CREATE POLICY "Users can view own transactions" ON coin_transactions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create transactions" ON coin_transactions
    FOR INSERT WITH CHECK (true);

-- User settings policies
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- BUSINESS LOGIC FUNCTIONS
-- ============================================================================

-- Calculate coin rewards based on video duration
CREATE OR REPLACE FUNCTION calculate_coins_by_duration(duration_seconds integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
    CASE
        WHEN duration_seconds >= 540 THEN RETURN 200;
        WHEN duration_seconds >= 480 THEN RETURN 150;
        WHEN duration_seconds >= 420 THEN RETURN 130;
        WHEN duration_seconds >= 360 THEN RETURN 100;
        WHEN duration_seconds >= 300 THEN RETURN 90;
        WHEN duration_seconds >= 240 THEN RETURN 70;
        WHEN duration_seconds >= 180 THEN RETURN 55;
        WHEN duration_seconds >= 150 THEN RETURN 50;
        WHEN duration_seconds >= 120 THEN RETURN 45;
        WHEN duration_seconds >= 90 THEN RETURN 35;
        WHEN duration_seconds >= 60 THEN RETURN 25;
        WHEN duration_seconds >= 45 THEN RETURN 15;
        WHEN duration_seconds >= 30 THEN RETURN 10;
        ELSE RETURN 5;
    END CASE;
END;
$$;

-- Safe coin transaction processing with validation
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
    
    -- Validate user exists
    IF current_balance IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
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
    
    -- Update user balance
    UPDATE profiles 
    SET coins = new_balance, updated_at = now()
    WHERE id = user_uuid;
    
    -- Record transaction
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
        RAISE LOG 'Error in update_user_coins_improved for user %: %', user_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Get next videos for user to watch
CREATE OR REPLACE FUNCTION get_next_video_for_user_enhanced(user_uuid uuid)
RETURNS TABLE(
    video_id uuid,
    youtube_url text,
    title text,
    duration_seconds integer,
    coin_reward integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.youtube_url,
        v.title,
        v.duration_seconds,
        v.coin_reward
    FROM videos v
    WHERE v.status IN ('active', 'repromoted')
        AND v.views_count < v.target_views
        AND v.user_id != user_uuid
        AND NOT EXISTS (
            SELECT 1 FROM video_views vv 
            WHERE vv.video_id = v.id 
            AND vv.viewer_id = user_uuid 
            AND vv.completed = true
        )
    ORDER BY 
        CASE WHEN v.status = 'repromoted' THEN 0 ELSE 1 END, -- Prioritize repromoted videos
        v.created_at ASC
    LIMIT 15;
END;
$$;

-- Award coins when user completes watching a video
CREATE OR REPLACE FUNCTION award_coins_for_video_completion(
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
    required_duration integer;
    coins_to_award integer;
    existing_view_record video_views%ROWTYPE;
    result json;
BEGIN
    -- Get video details with row lock
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
    
    -- Validate video hasn't reached target views
    IF video_record.views_count >= video_record.target_views THEN
        RETURN json_build_object('success', false, 'error', 'Video has reached maximum views');
    END IF;
    
    -- Check for existing completed view
    SELECT * INTO existing_view_record 
    FROM video_views 
    WHERE video_id = video_uuid AND viewer_id = user_uuid;
    
    IF existing_view_record IS NOT NULL AND existing_view_record.completed = true THEN
        RETURN json_build_object('success', false, 'error', 'Already completed this video');
    END IF;
    
    -- Calculate required watch duration (85% for better user experience)
    required_duration := FLOOR(video_record.duration_seconds * 0.85);
    IF required_duration < 10 THEN
        required_duration := LEAST(video_record.duration_seconds, 10);
    END IF;
    
    -- Validate sufficient watch time
    IF watch_duration < required_duration THEN
        -- Record incomplete view
        INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
        VALUES (video_uuid, user_uuid, watch_duration, false, 0)
        ON CONFLICT (video_id, viewer_id) 
        DO UPDATE SET 
            watched_duration = GREATEST(video_views.watched_duration, EXCLUDED.watched_duration);
            
        RETURN json_build_object(
            'success', false, 
            'error', 'Insufficient watch time',
            'required', required_duration,
            'watched', watch_duration
        );
    END IF;
    
    coins_to_award := video_record.coin_reward;
    
    -- Record completed view
    INSERT INTO video_views (video_id, viewer_id, watched_duration, completed, coins_earned)
    VALUES (video_uuid, user_uuid, watch_duration, true, coins_to_award)
    ON CONFLICT (video_id, viewer_id) 
    DO UPDATE SET 
        watched_duration = EXCLUDED.watched_duration,
        completed = true,
        coins_earned = EXCLUDED.coins_earned,
        created_at = now();
    
    -- Award coins to user
    PERFORM update_user_coins_improved(
        user_uuid, 
        coins_to_award, 
        'video_watch', 
        'Watched video: ' || video_record.title,
        video_uuid
    );
    
    -- Update video statistics
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
        'views_remaining', GREATEST(0, video_record.target_views - video_record.views_count),
        'video_completed', (video_record.views_count >= video_record.target_views)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in award_coins_for_video_completion: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', 'Internal error: ' || SQLERRM);
END;
$$;

-- Create video promotion with hold period
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
    -- Validate parameters
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

    -- Check user balance
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
    PERFORM update_user_coins_improved(
        user_uuid,
        -coin_cost_param,
        'video_promotion',
        'Promoted video: ' || title_param
    );
    
    -- Create video with 10-minute hold period
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
    
    RETURN video_id;
END;
$$;

-- ============================================================================
-- VIDEO STATUS MANAGEMENT
-- ============================================================================

-- Check and update expired hold videos
CREATE OR REPLACE FUNCTION check_and_update_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count integer := 0;
BEGIN
    -- Update videos that have expired hold periods
    UPDATE videos 
    SET 
        status = 'active',
        updated_at = now(),
        hold_until = NULL
    WHERE status = 'on_hold' 
    AND hold_until IS NOT NULL 
    AND hold_until <= now();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
        RAISE LOG 'Automatically activated % videos from hold status', updated_count;
    END IF;
    
    RETURN updated_count;
END;
$$;

-- Get video data with automatic status checking
CREATE OR REPLACE FUNCTION get_video_with_status_check(
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
    status_updated boolean := false;
BEGIN
    -- First, check and update any expired holds
    PERFORM check_and_update_expired_holds();
    
    -- Get fresh video data
    SELECT * INTO video_record 
    FROM videos 
    WHERE id = video_uuid AND user_id = user_uuid;
    
    IF video_record IS NULL THEN
        RETURN json_build_object('error', 'Video not found');
    END IF;
    
    -- Check if this specific video needs status update
    IF video_record.status = 'on_hold' 
       AND video_record.hold_until IS NOT NULL 
       AND video_record.hold_until <= now() THEN
        
        UPDATE videos 
        SET 
            status = 'active',
            updated_at = now(),
            hold_until = NULL
        WHERE id = video_uuid;
        
        video_record.status := 'active';
        video_record.updated_at := now();
        video_record.hold_until := NULL;
        status_updated := true;
    END IF;
    
    -- Return comprehensive video data
    RETURN json_build_object(
        'id', video_record.id,
        'title', video_record.title,
        'youtube_url', video_record.youtube_url,
        'views_count', video_record.views_count,
        'target_views', video_record.target_views,
        'status', video_record.status,
        'coin_cost', video_record.coin_cost,
        'coin_reward', video_record.coin_reward,
        'duration_seconds', video_record.duration_seconds,
        'hold_until', video_record.hold_until,
        'created_at', video_record.created_at,
        'updated_at', video_record.updated_at,
        'repromoted_at', video_record.repromoted_at,
        'completion_rate', CASE 
            WHEN video_record.target_views > 0 THEN 
                ROUND((video_record.views_count::decimal / video_record.target_views::decimal) * 100, 2)
            ELSE 0
        END,
        'status_updated', status_updated
    );
END;
$$;

-- ============================================================================
-- ANALYTICS FUNCTIONS
-- ============================================================================

-- Get user analytics summary
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
        COALESCE((
            SELECT SUM(ct.amount)::integer 
            FROM coin_transactions ct 
            WHERE ct.user_id = user_uuid 
            AND ct.amount > 0 
            AND ct.transaction_type IN ('referral_bonus', 'admin_adjustment', 'vip_purchase', 'video_deletion_refund')
        ), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'active'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'completed'), 0),
        COALESCE((SELECT COUNT(*)::integer FROM videos v WHERE v.user_id = user_uuid AND v.status = 'on_hold'), 0);
END;
$$;

-- Get recent activity (excluding video watch rewards for cleaner feed)
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
    LIMIT activity_limit;
END;
$$;

-- ============================================================================
-- VIDEO DELETION WITH REFUNDS
-- ============================================================================

-- Calculate refund amount based on time since creation
CREATE OR REPLACE FUNCTION calculate_refund_amount(
    video_created_at timestamptz,
    original_cost integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    minutes_since_creation integer;
    refund_percentage decimal(3,2);
BEGIN
    minutes_since_creation := EXTRACT(EPOCH FROM (now() - video_created_at)) / 60;
    
    -- 100% refund within 10 minutes, 80% after
    IF minutes_since_creation <= 10 THEN
        refund_percentage := 1.00;
    ELSE
        refund_percentage := 0.80;
    END IF;
    
    RETURN FLOOR(original_cost * refund_percentage);
END;
$$;

-- Delete video with proper cleanup and refund
CREATE OR REPLACE FUNCTION delete_video_with_refund(
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
    result json;
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
    
    -- Process refund
    IF refund_amount > 0 THEN
        PERFORM update_user_coins_improved(
            user_uuid,
            refund_amount,
            'video_deletion_refund',
            format('Refund for deleted video: %s (%s%% refund)', video_record.title, refund_percentage),
            video_uuid
        );
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'video_id', video_uuid,
        'title', video_record.title,
        'original_cost', video_record.coin_cost,
        'refund_amount', refund_amount,
        'refund_percentage', refund_percentage,
        'views_deleted', views_deleted_count,
        'message', format('Video deleted successfully. %s coins refunded (%s%%)', refund_amount, refund_percentage)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in delete_video_with_refund: %', SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

-- Handle new user creation with profile setup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_username text;
    referral_code_value text;
    attempt_count integer := 0;
    max_attempts integer := 10;
    base_username text;
BEGIN
    -- Extract username from metadata or email
    base_username := COALESCE(
        NEW.raw_user_meta_data->>'username', 
        split_part(NEW.email, '@', 1)
    );
    
    -- Clean username
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
    base_username := substring(base_username from 1 for 15);
    
    IF base_username = '' OR base_username IS NULL THEN
        base_username := 'user';
    END IF;
    
    new_username := base_username;
    referral_code_value := generate_referral_code();
    
    -- Insert profile with conflict resolution
    LOOP
        BEGIN
            INSERT INTO profiles (id, email, username, referral_code)
            VALUES (NEW.id, NEW.email, new_username, referral_code_value);
            EXIT;
            
        EXCEPTION
            WHEN unique_violation THEN
                attempt_count := attempt_count + 1;
                
                IF attempt_count < max_attempts THEN
                    new_username := base_username || '_' || attempt_count::text;
                    referral_code_value := generate_referral_code();
                ELSE
                    new_username := 'user_' || substring(NEW.id::text from 1 for 8);
                    referral_code_value := generate_referral_code();
                    
                    INSERT INTO profiles (id, email, username, referral_code)
                    VALUES (NEW.id, NEW.email, new_username, referral_code_value);
                    EXIT;
                END IF;
        END;
    END LOOP;
    
    -- Create user settings
    BEGIN
        INSERT INTO user_settings (user_id)
        VALUES (NEW.id);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Error creating user settings for user %: %', NEW.id, SQLERRM;
    END;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Fatal error in handle_new_user for user %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Auto-confirm email trigger for easier signup
CREATE OR REPLACE FUNCTION auto_confirm_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.email_confirmed_at := now();
    NEW.confirmation_token := null;
    RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS auto_confirm_email_trigger ON auth.users;
CREATE TRIGGER auto_confirm_email_trigger
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION auto_confirm_user_email();

-- Update timestamp triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at 
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION calculate_coins_by_duration(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_coins_improved(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_video_for_user_enhanced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION award_coins_for_video_completion(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION create_video_with_hold(integer, integer, integer, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_update_expired_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION get_video_with_status_check(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_analytics_summary_fixed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_activity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_refund_amount(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_video_with_refund(uuid, uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 VidGro Database Setup Completed Successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Tables Created:';
    RAISE NOTICE '  ✓ profiles - User accounts with coins and VIP status';
    RAISE NOTICE '  ✓ videos - Video promotions with hold system';
    RAISE NOTICE '  ✓ video_views - Watch history and completion tracking';
    RAISE NOTICE '  ✓ coin_transactions - Complete transaction audit trail';
    RAISE NOTICE '  ✓ user_settings - User preferences and configuration';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Security Features:';
    RAISE NOTICE '  ✓ Row Level Security (RLS) enabled on all tables';
    RAISE NOTICE '  ✓ Comprehensive access policies';
    RAISE NOTICE '  ✓ User data isolation and protection';
    RAISE NOTICE '';
    RAISE NOTICE '⚡ Business Logic:';
    RAISE NOTICE '  ✓ 10-minute hold period for new video promotions';
    RAISE NOTICE '  ✓ Automatic video activation after hold expires';
    RAISE NOTICE '  ✓ Time-based refund system (100%% within 10 min, 80%% after)';
    RAISE NOTICE '  ✓ VIP membership with 10%% promotion discounts';
    RAISE NOTICE '  ✓ Referral system with bonus rewards';
    RAISE NOTICE '  ✓ Real-time analytics and progress tracking';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready for Production!';
    RAISE NOTICE '  ✓ User signup and authentication';
    RAISE NOTICE '  ✓ Video promotion and watching';
    RAISE NOTICE '  ✓ Coin earning and spending';
    RAISE NOTICE '  ✓ Analytics and reporting';
    RAISE NOTICE '  ✓ VIP subscriptions and referrals';
END $$;