import { Suspense } from "react";
import { SearchClient } from "@/components/search/SearchClient";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Tìm kiếm đa nguồn
        </h1>
        <p className="text-sm text-zinc-400">
          Tự động debounce 350ms &amp; cache đa tầng cho tốc độ phản hồi tức thì.
        </p>
      </header>

      <Suspense fallback={<TrackSkeleton count={6} />}>
        <SearchClient />
      </Suspense>
    </div>
  );
}
