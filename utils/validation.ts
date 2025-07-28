export interface ValidationResult {
  isValid: boolean;
  error?: string;
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