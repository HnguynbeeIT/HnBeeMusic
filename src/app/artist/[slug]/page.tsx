import { ArtistPageClient } from "@/components/artist/ArtistPageClient";

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ source?: string; artistId?: string }>;
}

export default async function ArtistPage({
  params,
  searchParams,
}: ArtistPageProps) {
  const { slug } = await params;
  const { source, artistId } = await searchParams;
  const artistName = decodeURIComponent(slug);

  return (
    <ArtistPageClient
      artistName={artistName}
      initialSource={source}
      artistId={artistId}
    />
  );
}
