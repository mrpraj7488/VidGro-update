// YouTube utilities for VidGro app - System-based validation without API

interface YouTubeVideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  isEmbeddable: boolean;
  embedUrl: string;
}

// Extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Get video thumbnail URL
export function getThumbnailUrl(videoId: string, quality: 'default' | 'medium' | 'high' | 'standard' | 'maxres' = 'medium'): string {
  const qualityMap = {
    default: 'default',
    medium: 'mqdefault',
    high: 'hqdefault',
    standard: 'sddefault',
    maxres: 'maxresdefault',
  };

  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

// Get video embed URL
export function getEmbedUrl(videoId: string, options: {
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  mute?: boolean;
  start?: number;
  end?: number;
} = {}): string {
  const params = new URLSearchParams();
  
  if (options.autoplay) params.set('autoplay', '1');
  if (options.controls === false) params.set('controls', '0');
  if (options.loop) params.set('loop', '1');
  if (options.mute) params.set('mute', '1');
  if (options.start) params.set('start', options.start.toString());
  if (options.end) params.set('end', options.end.toString());
  
  // Always disable related videos from other channels
  params.set('rel', '0');
  
  const queryString = params.toString();
  return `https://www.youtube.com/embed/${videoId}${queryString ? `?${queryString}` : ''}`;
}

// Generate a default title from video ID (logic-based approach)
export function generateDefaultTitle(videoId: string): string {
  // Create a more descriptive default title
  const shortId = videoId.substring(0, 6);
  return `YouTube Video ${shortId}`;
}

// Simple logic-based validation (no API required)
export function validateVideoLogic(videoId: string): boolean {
  // Basic validation: check if video ID format is correct
  return videoId && videoId.length === 11 && /^[a-zA-Z0-9_-]+$/.test(videoId);
}

// Validate video for promotion (logic-based only)
export async function validateVideoForPromotion(url: string): Promise<{
  isValid: boolean;
  videoInfo?: YouTubeVideoInfo;
  error?: string;
}> {
  const videoId = extractVideoId(url);
  
  if (!videoId) {
    return {
      isValid: false,
      error: 'Invalid YouTube URL format'
    };
  }

  // Logic-based validation only
  if (!validateVideoLogic(videoId)) {
    return {
      isValid: false,
      error: 'Invalid video ID format'
    };
  }

  try {
    // Generate default title from video ID
    const title = generateDefaultTitle(videoId);
    
    const videoInfo: YouTubeVideoInfo = {
      id: videoId,
      title,
      thumbnail: getThumbnailUrl(videoId),
      isEmbeddable: true, // Assume embeddable for logic-based validation
      embedUrl: getEmbedUrl(videoId, { autoplay: true, controls: true })
    };

    return {
      isValid: true,
      videoInfo
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid video URL format'
    };
  }
}

// Format view count for display
export function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// Format duration for display
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Check if URL is a valid YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

// Get video watch URL from video ID
export function getWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Create YouTube search URL
export function createSearchUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://www.youtube.com/results?search_query=${encodedQuery}`;
}

// Get basic video info without API
export async function getBasicVideoInfo(url: string): Promise<YouTubeVideoInfo | null> {
  const validation = await validateVideoForPromotion(url);
  
  if (validation.isValid && validation.videoInfo) {
    return validation.videoInfo;
  }
  
  return null;
}

// YouTube player state constants
export const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

// Create iframe player HTML for WebView
export function createPlayerHTML(videoId: string, options: {
  width?: number;
  height?: number;
  autoplay?: boolean;
  controls?: boolean;
} = {}): string {
  const {
    width = 320,
    height = 180,
    autoplay = true,
    controls = true,
  } = options;

  const embedUrl = getEmbedUrl(videoId, { autoplay, controls });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        iframe {
          border: none;
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <iframe
        src="${embedUrl}"
        width="${width}"
        height="${height}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>
    </body>
    </html>
  `;
}

export default {
  extractVideoId,
  getThumbnailUrl,
  getEmbedUrl,
  generateDefaultTitle,
  validateVideoLogic,
  validateVideoForPromotion,
  formatViewCount,
  formatDuration,
  isValidYouTubeUrl,
  getWatchUrl,
  createSearchUrl,
  getBasicVideoInfo,
  createPlayerHTML,
  PLAYER_STATES,
};