"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { EngineHandle } from "./YouTubeAdapter";

interface SCWidget {
  bind: (
    event: string,
    listener: (payload?: { currentPosition?: number }) => void
  ) => void;
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
      existing.addEventListener("error", () =>
        reject(new Error("SC script failed"))
      );
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
    const initialSrcRef = useRef<string | null>(null);
    const [scriptReady, setScriptReady] = useState(false);

    // Freeze initial iframe src once mounted so switching SoundCloud tracks uses widget.load() without detaching contentWindow
    if (trackUrl && !initialSrcRef.current) {
      initialSrcRef.current = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        trackUrl
      )}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;
    }

    const activeRef = useRef(active);
    const isPlayingRef = useRef(isPlaying);
    const volumeRef = useRef(volume);
    activeRef.current = active;
    isPlayingRef.current = isPlaying;
    volumeRef.current = volume;

    // Safely invoke SC.Widget methods ONLY when iframe.contentWindow is live (prevents null postMessage crash)
    const safeWidgetCall = useCallback((fn: (w: SCWidget) => void) => {
      try {
        const iframe = iframeRef.current;
        const widget = widgetRef.current;
        if (!iframe || !iframe.contentWindow || !widget) return;
        fn(widget);
      } catch {}
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        play: () => safeWidgetCall((w) => w.play()),
        pause: () => safeWidgetCall((w) => w.pause()),
        stopAndReset: () =>
          safeWidgetCall((w) => {
            w.pause();
            w.seekTo(0);
          }),
        seekTo: (seconds: number) =>
          safeWidgetCall((w) =>
            w.seekTo(Math.max(0, Math.round(seconds * 1000)))
          ),
        setVolume: (vol: number) =>
          safeWidgetCall((w) => w.setVolume(Math.round(vol))),
      }),
      [safeWidgetCall]
    );

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
      if (
        !scriptReady ||
        !iframeRef.current ||
        !iframeRef.current.contentWindow ||
        !window.SC?.Widget ||
        widgetRef.current
      ) {
        return;
      }

      const widget = window.SC.Widget(iframeRef.current);
      const Events = window.SC.Widget.Events;
      widgetRef.current = widget;

      widget.bind(Events.READY, () => {
        safeWidgetCall((w) => {
          w.setVolume(Math.round(volumeRef.current));
          w.getDuration((ms) => {
            if (ms > 0) onDuration(ms / 1000);
          });
          if (activeRef.current && isPlayingRef.current) {
            w.play();
          }
        });
      });

      widget.bind(Events.PLAY, () => {
        if (!activeRef.current) return;
        onStateChange({ isPlaying: true, isLoading: false });
        safeWidgetCall((w) =>
          w.getDuration((ms) => {
            if (ms > 0) onDuration(ms / 1000);
          })
        );
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
    }, [
      scriptReady,
      initialSrcRef.current,
      onDuration,
      onEnded,
      onError,
      onProgress,
      onStateChange,
      safeWidgetCall,
    ]);

    // Load new SoundCloud track when trackUrl changes
    useEffect(() => {
      if (!active || !trackUrl) return;
      if (loadedUrlRef.current === trackUrl) return;
      if (!widgetRef.current || !iframeRef.current?.contentWindow) return;

      loadedUrlRef.current = trackUrl;
      safeWidgetCall((w) =>
        w.load(trackUrl, {
          auto_play: isPlayingRef.current,
          hide_related: true,
          show_comments: false,
          show_user: false,
          show_reposts: false,
          visual: false,
          callback: () => {
            safeWidgetCall((readyWidget) => {
              readyWidget.setVolume(Math.round(volumeRef.current));
              readyWidget.getDuration((ms) => {
                if (ms > 0) onDuration(ms / 1000);
              });
              if (activeRef.current && isPlayingRef.current) {
                readyWidget.play();
              }
            });
          },
        })
      );
    }, [active, trackUrl, onDuration, safeWidgetCall]);

    // Sync play/pause
    useEffect(() => {
      if (!active || !trackUrl) return;
      safeWidgetCall((w) => {
        if (isPlaying) {
          w.play();
        } else {
          w.pause();
        }
      });
    }, [active, isPlaying, trackUrl, safeWidgetCall]);

    // Sync volume
    useEffect(() => {
      safeWidgetCall((w) => w.setVolume(Math.round(volume)));
    }, [volume, safeWidgetCall]);

    // Keep iframe mounted once initialized so switching between SoundCloud tracks never invalidates contentWindow
    if (!initialSrcRef.current) return null;

    return (
      <iframe
        ref={iframeRef}
        title="HnBeeMusic SoundCloud Engine"
        aria-hidden="true"
        allow="autoplay; encrypted-media"
        src={initialSrcRef.current}
        className="pointer-events-none fixed bottom-0 right-0 z-0 h-8 w-8 overflow-hidden opacity-[0.01]"
      />
    );
  }
);
