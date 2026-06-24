export type MediaType = "video" | "audio" | "image";

export interface FormatOption {
  id: string;
  label: string;
  ext: string;
  quality: string;
  filesize?: number;
  filesizeLabel: string;
  hasVideo: boolean;
  hasAudio: boolean;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  /** Direct HTTPS URL for image/thumbnail downloads */
  directUrl?: string;
}

export interface MediaInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  durationLabel: string;
  uploader?: string;
  platform: string;
  webpageUrl: string;
  videoFormats: FormatOption[];
  audioFormats: FormatOption[];
  imageFormats: FormatOption[];
  /** Resolved on the user device (browser) — not via Render/yt-dlp */
  analyzedOnDevice?: boolean;
}

export interface InfoResponse {
  success: true;
  data: MediaInfo;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse = InfoResponse | ErrorResponse;
