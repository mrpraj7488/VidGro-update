/*
  # Fix Ambiguous Column Reference in Balance System
  
  This migration fixes the "column reference 'current_balance' is ambiguous" error
  in the update_user_balance_atomic function by properly qualifying column names.

  ## Issue
  The function has ambiguous column references when selecting from user_balances
  table, causing SQL errors during coin award operations.

  ## Solution
  - Properly qualify all column references with table aliases
  - Fix the SELECT statement in the retry loop
  - Ensure all column references are unambiguous
*/

-- ============================================================================
-- FIX AMBIGUOUS COLUMN REFERENCE ERROR
-- ============================================================================

-- Fixed version of update_user_balance_atomic with proper column qualification
CREATE OR REPLACE FUNCTION update_user_balance_atomic(
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
    current_version bigint;
    rows_affected integer;
    max_retries integer := 3;
    retry_count integer := 0;
    result json;
BEGIN
    -- Ensure user balance record exists
    PERFORM initialize_user_balance(user_uuid);
    
    -- Retry loop for optimistic locking
    LOOP
        -- Get current balance and version with row lock - FIX: properly qualify columns
        SELECT ub.current_balance, ub.version_number 
        INTO current_balance, current_version
        FROM user_balances ub
        WHERE ub.user_id = user_uuid
        FOR UPDATE;
        
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
        
        -- Attempt atomic update with version check
        UPDATE user_balances 
        SET 
            current_balance = new_balance,
            version_number = current_version + 1,
            last_transaction_at = now(),
            updated_at = now()
        WHERE user_id = user_uuid 
        AND version_number = current_version;
        
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        
        -- If update succeeded, break out of retry loop
        IF rows_affected = 1 THEN
            EXIT;
        END IF;
        
        -- Handle optimistic locking conflict
        retry_count := retry_count + 1;
        IF retry_count >= max_retries THEN
            RETURN json_build_object(
                'success', false, 
                'error', 'Balance update failed due to concurrent modifications'
            );
        END IF;
        
        -- Brief pause before retry
        PERFORM pg_sleep(0.01 * retry_count);
    END LOOP;
    
    -- Update profiles table for backward compatibility
    UPDATE profiles 
    SET coins = new_balance, updated_at = now()
    WHERE id = user_uuid;
    
    -- Create audit log entry
    INSERT INTO transaction_audit_log (
        user_id, 
        amount, 
        transaction_type, 
        description, 
        reference_id,
        balance_before,
        balance_after
    )
    VALUES (
        user_uuid, 
        coin_amount, 
        transaction_type_param, 
        description_param, 
        reference_uuid,
        current_balance,
        new_balance
    );
    
    -- Also create legacy transaction record for transition period
    INSERT INTO coin_transactions (user_id, amount, transaction_type, description, reference_id)
    VALUES (user_uuid, coin_amount, transaction_type_param, description_param, reference_uuid);
    
    RETURN json_build_object(
        'success', true,
        'previous_balance', current_balance,
        'new_balance', new_balance,
        'amount_changed', coin_amount,
        'version', current_version + 1
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in update_user_balance_atomic for user %: %', user_uuid, SQLERRM;
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- ALSO FIX INITIALIZE_USER_BALANCE FUNCTION
-- ============================================================================

-- Fixed version of initialize_user_balance with proper column qualification
CREATE OR REPLACE FUNCTION initialize_user_balance(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_coins integer;
BEGIN
    -- Get current balance from profiles table - FIX: properly qualify columns
    SELECT p.coins INTO current_coins 
    FROM profiles p
    WHERE p.id = user_uuid;
    
    IF current_coins IS NULL THEN
        RAISE EXCEPTION 'User not found: %', user_uuid;
    END IF;
    
    -- Create balance record if it doesn't exist
    INSERT INTO user_balances (user_id, current_balance, version_number, last_transaction_at)
    VALUES (user_uuid, current_coins, 1, now())
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ============================================================================
-- FIX GET_USER_BALANCE_FAST FUNCTION
-- ============================================================================

-- Fixed version of get_user_balance_fast with proper column qualification
CREATE OR REPLACE FUNCTION get_user_balance_fast(user_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    balance_record user_balances%ROWTYPE;
    result json;
BEGIN
    -- Ensure balance record exists
    PERFORM initialize_user_balance(user_uuid);
    
    -- Get balance record - FIX: properly qualify columns
    SELECT ub.* INTO balance_record
    FROM user_balances ub
    WHERE ub.user_id = user_uuid;
    
    IF balance_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Balance record not found'
        );
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'balance', balance_record.current_balance,
        'last_transaction_at', balance_record.last_transaction_at,
        'version', balance_record.version_number
    );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_user_balance_atomic(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_user_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_balance_fast(uuid) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 Fixed Ambiguous Column Reference Error!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Issues Resolved:';
    RAISE NOTICE '  ✓ Properly qualified column references in update_user_balance_atomic';
    RAISE NOTICE '  ✓ Fixed SELECT statement with table aliases';
    RAISE NOTICE '  ✓ Updated initialize_user_balance function';
    RAISE NOTICE '  ✓ Updated get_user_balance_fast function';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Coin award system should now work correctly!';
    RAISE NOTICE '  ✓ Timer completion will properly award coins';
    RAISE NOTICE '  ✓ Balance updates will work without SQL errors';
    RAISE NOTICE '  ✓ Video watching experience restored';
END $$;