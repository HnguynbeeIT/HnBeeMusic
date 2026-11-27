import { ZingMp3Adapter } from "@/adapters/zingmp3.adapter";
import { NctAdapter } from "@/adapters/nct.adapter";
import {
  aggregatorService,
  type AggregatorService,
} from "@/services/aggregator.service";

export const zingMp3Adapter = new ZingMp3Adapter();
export const nctAdapter = new NctAdapter();

export function registerVnAdapters(
  service: AggregatorService = aggregatorService
): AggregatorService {
  service.registerAdapter(zingMp3Adapter);
  service.registerAdapter(nctAdapter);
  return service;
}
