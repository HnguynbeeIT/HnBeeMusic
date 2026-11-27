import { AppleMusicAdapter } from "@/adapters/apple-music.adapter";
import { SpotifyAdapter } from "@/adapters/spotify.adapter";
import { YouTubeAdapter } from "@/adapters/youtube.adapter";
import { SoundCloudAdapter } from "@/adapters/soundcloud.adapter";
import {
  aggregatorService,
  type AggregatorService,
} from "@/services/aggregator.service";

export const appleMusicAdapter = new AppleMusicAdapter();
export const spotifyAdapter = new SpotifyAdapter();
export const youtubeAdapter = new YouTubeAdapter();
export const soundcloudAdapter = new SoundCloudAdapter();

export function registerGlobalAdapters(
  service: AggregatorService = aggregatorService
): AggregatorService {
  service.registerAdapter(youtubeAdapter);
  service.registerAdapter(soundcloudAdapter);
  service.registerAdapter(spotifyAdapter);
  service.registerAdapter(appleMusicAdapter);
  return service;
}
