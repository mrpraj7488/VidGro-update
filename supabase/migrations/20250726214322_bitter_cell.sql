/*
  # Fix Transaction Type Constraint for video_watch
  
  This migration fixes the check constraint on coin_transactions table to allow
  'video_watch' as a valid transaction type, which is needed for coin rewards.

  ## Issue
  The coin_transactions table has a check constraint that doesn't include 'video_watch'
  as a valid transaction type, causing video reward transactions to fail.

  ## Solution
  - Drop the existing constraint
  - Recreate it with 'video_watch' included in the allowed values
*/

-- ============================================================================
-- FIX TRANSACTION TYPE CONSTRAINT
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;

-- Recreate the constraint with video_watch included
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_transaction_type_check 
CHECK (transaction_type IN (
    'video_watch',
    'video_promotion', 
    'purchase', 
    'referral_bonus', 
    'admin_adjustment', 
    'vip_purchase', 
    'ad_stop_purchase',
    'video_deletion_refund'
));

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 Transaction Type Constraint Fixed!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Changes Made:';
    RAISE NOTICE '  ✓ Added video_watch to allowed transaction types';
    RAISE NOTICE '  ✓ Updated coin_transactions table constraint';
    RAISE NOTICE '  ✓ Video rewards should now work correctly';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Allowed Transaction Types:';
    RAISE NOTICE '  ✓ video_watch (for earning coins by watching)';
    RAISE NOTICE '  ✓ video_promotion (for promoting videos)';
    RAISE NOTICE '  ✓ purchase (for buying coins)';
    RAISE NOTICE '  ✓ referral_bonus (for referral rewards)';
    RAISE NOTICE '  ✓ admin_adjustment (for admin changes)';
    RAISE NOTICE '  ✓ vip_purchase (for VIP subscriptions)';
    RAISE NOTICE '  ✓ ad_stop_purchase (for ad-free time)';
    RAISE NOTICE '  ✓ video_deletion_refund (for video deletion refunds)';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Video watching and coin earning should now work!';
END $$;