import {
  CURATED_PLAYLISTS,
  FALLBACK_CATALOG,
} from "@/lib/adapters/fallback-catalog";
import { HomeCatalogClient } from "@/components/home/HomeCatalogClient";

export default function HomePage() {
  return (
    <HomeCatalogClient
      tracks={FALLBACK_CATALOG}
      curatedPlaylists={CURATED_PLAYLISTS}
    />
  );
}
