/** InnerTube client configs — keep in sync with youtubei.js Constants. */
export const YOUTUBE_INNERTUBE_CLIENTS = {
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "21.03.36",
    androidSdkVersion: 36,
    hl: "en",
    gl: "US",
  },
  IOS: {
    clientName: "IOS",
    clientVersion: "20.11.6",
    deviceModel: "iPhone10,4",
    hl: "en",
    gl: "US",
  },
  TV: {
    clientName: "TVHTML5",
    clientVersion: "7.20260311.12.00",
    hl: "en",
    gl: "US",
  },
} as const;

export type YoutubeInnertubeClientName = keyof typeof YOUTUBE_INNERTUBE_CLIENTS;

export const YOUTUBE_INNERTUBE_CLIENT_ORDER: YoutubeInnertubeClientName[] = [
  "ANDROID",
  "IOS",
];
