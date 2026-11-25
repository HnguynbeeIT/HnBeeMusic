import { FALLBACK_CATALOG } from "@/lib/adapters/fallback-catalog";
import { UrlResolverBar } from "@/components/search/UrlResolverBar";
import { HomeCatalogClient } from "@/components/home/HomeCatalogClient";

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Direct URL Resolver (Spotify / YouTube / SoundCloud) */}
      <UrlResolverBar />

      {/* Hero Banner + Source Filter Tabs + Staggered 10-track Showcase */}
      <HomeCatalogClient tracks={FALLBACK_CATALOG} />
    </div>
  );
}
