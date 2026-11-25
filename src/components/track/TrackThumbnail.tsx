"use client";

import { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";
import { getFallbackThumbnail } from "@/lib/audio/normalize";

interface TrackThumbnailProps {
  src?: string;
  alt: string;
  className?: string;
}

export function TrackThumbnail({
  src,
  alt,
  className = "h-12 w-12 rounded-lg",
}: TrackThumbnailProps) {
  const [imgSrc, setImgSrc] = useState(src || "");
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setImgSrc(src || "");
    setFailed(!src);
  }, [src]);

  const handleError = () => {
    const fallback = getFallbackThumbnail(imgSrc);
    if (fallback && fallback !== imgSrc) {
      setImgSrc(fallback);
    } else {
      setFailed(true);
    }
  };

  // YouTube returns a 120x90 gray placeholder with HTTP 404 when maxresdefault.jpg doesn't exist
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (
      /maxresdefault\.(jpg|webp)/i.test(imgSrc) &&
      e.currentTarget.naturalWidth <= 120
    ) {
      const fallback = getFallbackThumbnail(imgSrc);
      if (fallback && fallback !== imgSrc) {
        setImgSrc(fallback);
      }
    }
  };

  if (failed || !imgSrc) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-500 ring-1 ring-white/10 ${className}`}
      >
        <Disc3 className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading="lazy"
      onLoad={handleLoad}
      onError={handleError}
      className={`shrink-0 object-cover ring-1 ring-white/10 ${className}`}
    />
  );
}
