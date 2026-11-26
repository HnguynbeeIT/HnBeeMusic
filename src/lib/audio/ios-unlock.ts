"use client";

/**
 * iOS Safari Instant Audio Unlock:
 * Registers the single global HTML5 <audio> element and unlocks autoplay permission
 * synchronously inside the user's tap/click gesture BEFORE any async API fetch,
 * preventing `NotAllowedError` when resolving Spotify/SoundCloud/Piped streams.
 */
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let globalAudioEl: HTMLAudioElement | null = null;
let audioUnlocked = false;
let listenersAttached = false;

export function registerGlobalAudioElement(el: HTMLAudioElement | null): void {
  globalAudioEl = el;
  if (typeof window === "undefined" || listenersAttached) return;
  listenersAttached = true;

  const handleFirstGesture = () => {
    unlockGlobalAudioNow();
    if (audioUnlocked) {
      window.removeEventListener("touchstart", handleFirstGesture, true);
      window.removeEventListener("touchend", handleFirstGesture, true);
      window.removeEventListener("click", handleFirstGesture, true);
    }
  };

  window.addEventListener("touchstart", handleFirstGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener("touchend", handleFirstGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener("click", handleFirstGesture, {
    capture: true,
    passive: true,
  });
}

/**
 * Call synchronously inside user-initiated playTrack / playPlaylist / togglePlay
 * BEFORE awaiting any async API.
 */
export function unlockGlobalAudioNow(): void {
  if (typeof window === "undefined") return;

  // 1. Unlock Web AudioContext if supported (iOS Safari background continuity)
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
      void ctx.close().catch(() => {});
    }
  } catch {}

  // 2. Unlock the single global <audio> element using a 1-frame silent WAV
  if (audioUnlocked || !globalAudioEl) return;

  const el = globalAudioEl;
  // Never interrupt an already-playing real audio stream
  if (!el.paused && el.src && !el.src.startsWith("data:audio/wav")) {
    audioUnlocked = true;
    return;
  }

  try {
    const prevSrc = el.getAttribute("src");
    if (!prevSrc) {
      el.src = SILENT_WAV_DATA_URI;
      el.load();
    }
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          audioUnlocked = true;
          if (!prevSrc) {
            el.pause();
            try {
              el.removeAttribute("src");
              el.load();
            } catch {}
          }
        })
        .catch(() => {
          // Will retry on next user touch/click
        });
    } else {
      audioUnlocked = true;
    }
  } catch {}
}
