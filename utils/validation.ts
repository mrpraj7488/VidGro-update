// Input validation utilities for VidGro app

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Simplified email validation (basic format check only)
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }

  // Basic format check only - no complex validation
  if (!email.includes('@') || !email.includes('.')) {
    return { isValid: false, error: 'Please enter a valid email format' };
  }

  return { isValid: true };
}

// Password validation
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters long' };
  }

  return { isValid: true };
}

// Username validation
export function validateUsername(username: string): ValidationResult {
  if (!username) {
    return { isValid: false, error: 'Username is required' };
  }

  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }

  if (username.length > 20) {
    return { isValid: false, error: 'Username must be less than 20 characters' };
  }

  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }

  return { isValid: true };
}

// YouTube URL validation (logic-based only)
export function validateYouTubeUrl(url: string): ValidationResult {
  if (!url) {
    return { isValid: false, error: 'YouTube URL is required' };
  }

  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  if (!youtubeRegex.test(url)) {
    return { isValid: false, error: 'Please enter a valid YouTube URL' };
  }

  return { isValid: true };
}

// Video title validation
export function validateVideoTitle(title: string): ValidationResult {
  if (!title) {
    return { isValid: false, error: 'Video title is required' };
  }

  if (title.trim().length < 5) {
    return { isValid: false, error: 'Title must be at least 5 characters long' };
  }

  if (title.length > 100) {
    return { isValid: false, error: 'Title must be less than 100 characters' };
  }

  return { isValid: true };
}

// Video duration validation
export function validateVideoDuration(duration: number): ValidationResult {
  if (!duration || duration <= 0) {
    return { isValid: false, error: 'Duration must be greater than 0' };
  }

  if (duration < 10) {
    return { isValid: false, error: 'Video must be at least 10 seconds long' };
  }

  if (duration > 600) {
    return { isValid: false, error: 'Video must be less than 10 minutes long' };
  }

  return { isValid: true };
}

// Target views validation
export function validateTargetViews(views: number): ValidationResult {
  if (!views || views <= 0) {
    return { isValid: false, error: 'Target views must be greater than 0' };
  }

  if (views > 1000) {
    return { isValid: false, error: 'Target views cannot exceed 1000' };
  }

  return { isValid: true };
}

// Coin amount validation
export function validateCoinAmount(amount: number): ValidationResult {
  if (amount === undefined || amount === null) {
    return { isValid: false, error: 'Amount is required' };
  }

  if (amount < 0) {
    return { isValid: false, error: 'Amount cannot be negative' };
  }

  if (!Number.isInteger(amount)) {
    return { isValid: false, error: 'Amount must be a whole number' };
  }

  return { isValid: true };
}

// Support message validation
export function validateSupportMessage(message: string): ValidationResult {
  if (!message) {
    return { isValid: false, error: 'Message is required' };
  }

  if (message.trim().length < 10) {
    return { isValid: false, error: 'Message must be at least 10 characters long' };
  }

  if (message.length > 1000) {
    return { isValid: false, error: 'Message must be less than 1000 characters' };
  }

  return { isValid: true };
}

// Referral code validation
export function validateReferralCode(code: string): ValidationResult {
  if (!code) {
    return { isValid: false, error: 'Referral code is required' };
  }

  if (code.length !== 8) {
    return { isValid: false, error: 'Referral code must be 8 characters long' };
  }

  const codeRegex = /^[A-Za-z0-9+/=]+$/;
  if (!codeRegex.test(code)) {
    return { isValid: false, error: 'Invalid referral code format' };
  }

  return { isValid: true };
}

// Form validation helper
export function validateForm(fields: { [key: string]: any }, validators: { [key: string]: (value: any) => ValidationResult }): { isValid: boolean; errors: { [key: string]: string } } {
  const errors: { [key: string]: string } = {};
  let isValid = true;

  for (const [fieldName, value] of Object.entries(fields)) {
    const validator = validators[fieldName];
    if (validator) {
      const result = validator(value);
      if (!result.isValid) {
        errors[fieldName] = result.error || 'Invalid value';
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}

// Sanitize input to prevent XSS
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove < and > characters
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

// Extract YouTube video ID from URL
export function extractYouTubeVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Format duration for display
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Calculate coin cost based on views and duration
export function calculatePromotionCost(views: number, duration: number, isVip: boolean = false): number {
  const baseCost = views * 2;
  const durationMultiplier = duration / 60; // Per minute
  const totalCost = Math.ceil(baseCost * durationMultiplier);
  
  // VIP discount
  if (isVip) {
    return Math.ceil(totalCost * 0.9); // 10% discount
  }
  
  return totalCost;
}

// Calculate coin reward based on duration
export function calculateCoinReward(duration: number): number {
  if (duration >= 540) return 200;
  if (duration >= 480) return 150;
  if (duration >= 420) return 130;
  if (duration >= 360) return 100;
  if (duration >= 300) return 90;
  if (duration >= 240) return 70;
  if (duration >= 180) return 55;
  if (duration >= 150) return 50;
  if (duration >= 120) return 45;
  if (duration >= 90) return 35;
  if (duration >= 60) return 25;
  if (duration >= 45) return 15;
  if (duration >= 35) return 10;
  return 5;
}

// Validate watch completion (95% threshold)
export function validateWatchCompletion(watchedDuration: number, totalDuration: number): boolean {
  const requiredDuration = Math.floor(totalDuration * 0.95);
  return watchedDuration >= requiredDuration;
}

// Rate limiting helper
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>();

  return (identifier: string): boolean => {
    const now = Date.now();
    const userRequests = requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }
    
    validRequests.push(now);
    requests.set(identifier, validRequests);
    return true; // Request allowed
  };
}

export default {
  validateEmail,
  validatePassword,
  validateUsername,
  validateYouTubeUrl,
  validateVideoTitle,
  validateVideoDuration,
  validateTargetViews,
  validateCoinAmount,
  validateSupportMessage,
  validateReferralCode,
  validateForm,
  sanitizeInput,
  extractYouTubeVideoId,
  formatDuration,
  calculatePromotionCost,
  calculateCoinReward,
  validateWatchCompletion,
  createRateLimiter,
};