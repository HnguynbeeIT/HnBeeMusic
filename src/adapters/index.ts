import { registerVnAdapters } from "@/adapters/register-vn";
import { registerGlobalAdapters } from "@/adapters/register-global";
import {
  aggregatorService,
  type AggregatorService,
} from "@/services/aggregator.service";

export { BaseAdapter } from "@/adapters/base.adapter";
export { ZingMp3Adapter } from "@/adapters/zingmp3.adapter";
export { NctAdapter } from "@/adapters/nct.adapter";
export { AppleMusicAdapter } from "@/adapters/apple-music.adapter";
export { SpotifyAdapter } from "@/adapters/spotify.adapter";
export { YouTubeAdapter } from "@/adapters/youtube.adapter";
export { SoundCloudAdapter } from "@/adapters/soundcloud.adapter";
export { registerVnAdapters, zingMp3Adapter, nctAdapter } from "@/adapters/register-vn";
export {
  registerGlobalAdapters,
  appleMusicAdapter,
  spotifyAdapter,
  youtubeAdapter,
  soundcloudAdapter,
} from "@/adapters/register-global";

let initialized = false;

/**
 * Registers all Vietnamese and Global audio adapters into the shared AggregatorService once.
 */
export function ensureAdaptersRegistered(
  service: AggregatorService = aggregatorService
): AggregatorService {
  if (service === aggregatorService && initialized) {
    return service;
  }
  registerGlobalAdapters(service);
  registerVnAdapters(service);
  if (service === aggregatorService) {
    initialized = true;
  }
  return service;
}
