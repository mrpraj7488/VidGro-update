export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }

  if (!email.includes('@') || !email.includes('.')) {
    return { isValid: false, error: 'Please enter a valid email format' };
  }

  return { isValid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters long' };
  }

  return { isValid: true };
}

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

export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  const trimmedInput = url.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedInput)) {
    return trimmedInput;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?.*[&?]v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmedInput.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return videoId;
      }
    }
  }

  return null;
}

export function calculatePromotionCost(views: number, duration: number, isVip: boolean = false): number {
  // Updated with higher cost calculation to match promote tab
  const baseCost = Math.ceil((views * duration) / 50 * 8);
  
  if (isVip) {
    return Math.ceil(baseCost * 0.9);
  }
  
  return baseCost;
}

export function calculateVipDiscount(views: number, duration: number): number {
  const baseCost = Math.ceil((views * duration) / 50 * 8);
  return Math.ceil(baseCost * 0.1);
}

export default {
  validateEmail,
  validatePassword,
  validateUsername,
  validateYouTubeUrl,
  validateVideoTitle,
  extractYouTubeVideoId,
  calculatePromotionCost,
  calculateVipDiscount,
};