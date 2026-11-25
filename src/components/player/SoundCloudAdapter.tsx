"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { EngineHandle } from "./YouTubeAdapter";

interface SCWidget {
  bind: (event: string, listener: (payload?: { currentPosition?: number }) => void) => void;
  unbind: (event: string) => void;
  load: (url: string, options?: Record<string, unknown>) => void;
  play: () => void;
  pause: () => void;
  seekTo: (milliseconds: number) => void;
  setVolume: (volume: number) => void;
  getDuration: (cb: (ms: number) => void) => void;
}

declare global {
  interface Window {
    SC?: {
      Widget: {
        (iframe: HTMLIFrameElement): SCWidget;
        Events: {
          READY: string;
          PLAY: string;
          PAUSE: string;
          FINISH: string;
          PLAY_PROGRESS: string;
          ERROR: string;
        };
      };
    };
  }
}

interface SoundCloudAdapterProps {
  trackUrl: string | null;
  active: boolean;
  isPlaying: boolean;
  volume: number;
  onProgress: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onStateChange: (state: { isPlaying?: boolean; isLoading?: boolean }) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

let scScriptPromise: Promise<void> | null = null;

function loadSoundCloudWidgetScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.SC?.Widget) return Promise.resolve();
  if (scScriptPromise) return scScriptPromise;

  scScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://w.soundcloud.com/player/api.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SC script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SC script failed"));
    document.head.appendChild(script);
  });

  return scScriptPromise;
}

export const SoundCloudAdapter = forwardRef<EngineHandle, SoundCloudAdapterProps>(
  function SoundCloudAdapter(
    {
      trackUrl,
      active,
      isPlaying,
      volume,
      onProgress,
      onDuration,
      onStateChange,
      onEnded,
      onError,
    },
    ref
  ) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const widgetRef = useRef<SCWidget | null>(null);
    const loadedUrlRef = useRef<string | null>(null);
    const [scriptReady, setScriptReady] = useState(false);

    const activeRef = useRef(active);
    const isPlayingRef = useRef(isPlaying);
    const volumeRef = useRef(volume);
    activeRef.current = active;
    isPlayingRef.current = isPlaying;
    volumeRef.current = volume;

    useImperativeHandle(ref, () => ({
      play: () => {
        try {
          widgetRef.current?.play();
        } catch {}
      },
      pause: () => {
        try {
          widgetRef.current?.pause();
        } catch {}
      },
      stopAndReset: () => {
        try {
          widgetRef.current?.pause();
          widgetRef.current?.seekTo(0);
        } catch {}
      },
      seekTo: (seconds: number) => {
        try {
          widgetRef.current?.seekTo(Math.max(0, Math.round(seconds * 1000)));
        } catch {}
      },
      setVolume: (vol: number) => {
        try {
          widgetRef.current?.setVolume(Math.round(vol));
        } catch {}
      },
    }));

    useEffect(() => {
      if (!trackUrl) return;
      loadSoundCloudWidgetScript()
        .then(() => setScriptReady(true))
        .catch(() => {
          if (activeRef.current) {
            onError("Không thể tải SoundCloud Widget API.");
          }
        });
    }, [trackUrl, onError]);

    useEffect(() => {
      if (!scriptReady || !iframeRef.current || !window.SC?.Widget || widgetRef.current) {
        return;
      }

      const widget = window.SC.Widget(iframeRef.current);
      const Events = window.SC.Widget.Events;
      widgetRef.current = widget;

      widget.bind(Events.READY, () => {
        widget.setVolume(Math.round(volumeRef.current));
        widget.getDuration((ms) => {
          if (ms > 0) onDuration(ms / 1000);
        });
        if (activeRef.current && isPlayingRef.current) {
          widget.play();
        }
      });

      widget.bind(Events.PLAY, () => {
        if (!activeRef.current) return;
        onStateChange({ isPlaying: true, isLoading: false });
        widget.getDuration((ms) => {
          if (ms > 0) onDuration(ms / 1000);
        });
      });

      widget.bind(Events.PAUSE, () => {
        if (!activeRef.current) return;
        onStateChange({ isPlaying: false, isLoading: false });
      });

      widget.bind(Events.PLAY_PROGRESS, (payload) => {
        if (!activeRef.current) return;
        if (typeof payload?.currentPosition === "number") {
          onProgress(payload.currentPosition / 1000);
        }
      });

      widget.bind(Events.FINISH, () => {
        if (!activeRef.current) return;
        onEnded();
      });

      widget.bind(Events.ERROR, () => {
        if (!activeRef.current) return;
        onStateChange({ isPlaying: false, isLoading: false });
        onError("Không thể phát nguồn SoundCloud này.");
      });
    }, [scriptReady, onDuration, onEnded, onError, onProgress, onStateChange]);

    // Load new SoundCloud track when trackUrl changes
    useEffect(() => {
      if (!active || !trackUrl || !widgetRef.current) return;
      if (loadedUrlRef.current === trackUrl) return;
      loadedUrlRef.current = trackUrl;

      widgetRef.current.load(trackUrl, {
        auto_play: isPlayingRef.current,
        hide_related: true,
        show_comments: false,
        show_user: false,
        show_reposts: false,
        visual: false,
        callback: () => {
          widgetRef.current?.setVolume(Math.round(volumeRef.current));
          widgetRef.current?.getDuration((ms) => {
            if (ms > 0) onDuration(ms / 1000);
          });
          if (activeRef.current && isPlayingRef.current) {
            widgetRef.current?.play();
          }
        },
      });
    }, [active, trackUrl, onDuration]);

    // Sync play/pause
    useEffect(() => {
      if (!active || !trackUrl || !widgetRef.current) return;
      if (isPlaying) {
        widgetRef.current.play();
      } else {
        widgetRef.current.pause();
      }
    }, [active, isPlaying, trackUrl]);

    // Sync volume
    useEffect(() => {
      widgetRef.current?.setVolume(Math.round(volume));
    }, [volume]);

    if (!trackUrl) return null;

    const initialSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
      trackUrl
    )}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;

    return (
      <iframe
        ref={iframeRef}
        title="HnBeeMusic SoundCloud Engine"
        aria-hidden="true"
        allow="autoplay"
        src={initialSrc}
        className="pointer-events-none fixed -left-[9999px] -top-[9999px] h-px w-px opacity-0"
      />
    );
  }
);
