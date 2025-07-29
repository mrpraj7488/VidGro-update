-- Fix Profile Creation Trigger
-- This migration fixes the handle_new_user function to properly create profiles

-- Drop and recreate the handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username TEXT;
BEGIN
  -- Generate a unique username
  new_username := COALESCE(
    NEW.raw_user_meta_data->>'username', 
    'user_' || substr(NEW.id::text, 1, 8)
  );
  
  -- Ensure username is unique by appending a number if needed
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = new_username) LOOP
    new_username := COALESCE(NEW.raw_user_meta_data->>'username', 'user') || '_' || substr(NEW.id::text, 1, 8) || '_' || floor(random() * 1000)::text;
  END LOOP;
  
  -- Insert the profile with proper error handling
  INSERT INTO profiles (id, email, username, coins, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    new_username,
    100, -- Starting coins
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate insertions
  
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user % (email: %): %', NEW.id, NEW.email, SQLERRM;
    
    -- Try a simpler insert as fallback
    BEGIN
      INSERT INTO profiles (id, email, username)
      VALUES (
        NEW.id,
        COALESCE(NEW.email, 'user@example.com'),
        'user_' || substr(NEW.id::text, 1, 8) || '_' || extract(epoch from now())::bigint
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN others THEN
        RAISE WARNING 'Fallback profile creation also failed for user %: %', NEW.id, SQLERRM;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Also create a function to manually create missing profiles
CREATE OR REPLACE FUNCTION create_missing_profile(user_id UUID, user_email TEXT, user_username TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  final_username TEXT;
  profile_exists BOOLEAN;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = user_id) INTO profile_exists;
  
  IF profile_exists THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Profile already exists',
      'action', 'none'
    );
  END IF;
  
  -- Generate username
  final_username := COALESCE(
    user_username,
    'user_' || substr(user_id::text, 1, 8)
  );
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = final_username) LOOP
    final_username := COALESCE(user_username, 'user') || '_' || substr(user_id::text, 1, 8) || '_' || floor(random() * 1000)::text;
  END LOOP;
  
  -- Create the profile
  INSERT INTO profiles (id, email, username, coins, created_at, updated_at)
  VALUES (
    user_id,
    user_email,
    final_username,
    100,
    NOW(),
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Profile created successfully',
    'username', final_username,
    'action', 'created'
  );
  
EXCEPTION
  WHEN others THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'action', 'failed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_missing_profile(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;

-- Update RLS policies to ensure proper access
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to insert profiles (for the trigger)
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- Ensure the profiles table has the correct structure
DO $$
BEGIN
  -- Add referral_code default if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'referral_code' 
    AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE profiles ALTER COLUMN referral_code SET DEFAULT encode(gen_random_bytes(6), 'base64');
  END IF;
END $$;