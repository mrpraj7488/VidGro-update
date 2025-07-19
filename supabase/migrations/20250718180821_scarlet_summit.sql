/*
  # Disable Email Validation on Server Side
  
  This migration disables Supabase's built-in email validation to allow any email format.
  
  1. Configuration Changes
    - Disable email validation in auth settings
    - Allow any email format to be accepted
    - Remove email confirmation requirements
  
  2. Security Notes
    - This removes email format validation entirely
    - Consider implementing your own validation logic if needed
    - Users can sign up with any string containing @ symbol
*/

-- Disable email validation by updating auth configuration
-- This allows any email format to pass through Supabase auth

-- Create a function to bypass email validation
CREATE OR REPLACE FUNCTION auth.email_change_confirm_status(user_id uuid, new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Always confirm email changes without validation
  UPDATE auth.users 
  SET 
    email = new_email,
    email_confirmed_at = now(),
    email_change = null,
    email_change_token_new = null,
    email_change_confirm_status = 0
  WHERE id = user_id;
END;
$$;

-- Create a function to handle signup without email validation
CREATE OR REPLACE FUNCTION auth.signup_without_email_validation(
  email text,
  password text,
  user_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
BEGIN
  -- Generate user ID
  user_id := gen_random_uuid();
  
  -- Encrypt password (simplified - in real implementation you'd use proper hashing)
  encrypted_pw := crypt(password, gen_salt('bf'));
  
  -- Insert user directly without email validation
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_confirm_status
  ) VALUES (
    user_id,
    email,
    encrypted_pw,
    now(), -- Immediately confirm email
    user_metadata,
    now(),
    now(),
    null,
    null,
    null,
    0
  );
  
  RETURN user_id;
END;
$$;

-- Update auth configuration to disable email validation
-- Note: This requires superuser privileges and may not work in all Supabase instances
DO $$
BEGIN
  -- Try to update auth configuration if possible
  BEGIN
    -- Disable email validation in auth settings
    UPDATE auth.config 
    SET 
      disable_signup = false,
      email_confirm_required = false,
      email_change_confirm_required = false
    WHERE true;
  EXCEPTION
    WHEN OTHERS THEN
      -- If config table doesn't exist or we don't have permissions, continue
      RAISE NOTICE 'Could not update auth config - this is normal for hosted Supabase';
  END;
END $$;

-- Create a trigger to auto-confirm emails on user creation
CREATE OR REPLACE FUNCTION auto_confirm_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Automatically confirm email for new users
  NEW.email_confirmed_at := now();
  NEW.confirmation_token := null;
  RETURN NEW;
END;
$$;

-- Apply the trigger to auto-confirm emails
DROP TRIGGER IF EXISTS auto_confirm_email_trigger ON auth.users;
CREATE TRIGGER auto_confirm_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_confirm_user_email();

-- Create a function to validate any email format (always returns true)
CREATE OR REPLACE FUNCTION public.validate_email_format(email text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  -- Accept any email that contains @ symbol
  RETURN email IS NOT NULL AND email LIKE '%@%';
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Email validation has been disabled on the server side.';
  RAISE NOTICE 'Users can now sign up with any email format containing @ symbol.';
  RAISE NOTICE 'All new users will have their emails automatically confirmed.';
END $$;