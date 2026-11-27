"use client";

import { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";

declare global {
  interface Window {
    hnbeeDesktop?: {
      isDesktop?: boolean;
      isElectron?: boolean;
      platform?: string;
      version?: string;
      setPlayingState?: (isPlaying: boolean) => void;
      openOAuth?: (provider: "google" | "facebook") => void;
    };
  }
}

export function isElectronClient(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.hnbeeDesktop?.isDesktop ||
      window.hnbeeDesktop?.isElectron ||
      /Electron/i.test(navigator.userAgent)
  );
}

/**
 * Renders a native-feeling 36px frameless draggable title bar ONLY when running inside
 * the HnBee Music Windows/macOS Electron Desktop app.
 * Leaves the right 144px unobstructed for Windows 10/11 titleBarOverlay minimize/maximize/close controls.
 */
export function ElectronTitleBar() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const detected = isElectronClient();
    setIsDesktop(detected);
    if (detected) {
      document.documentElement.classList.add("hnbee-electron");
    }
    return () => {
      document.documentElement.classList.remove("hnbee-electron");
    };
  }, []);

  if (!isDesktop) return null;

  return (
    <div
      role="banner"
      aria-label="HnBeeMusic Desktop Title Bar"
      className="electron-drag fixed inset-x-0 top-0 z-[9990] flex h-9 select-none items-center justify-between border-b border-[#A8B2C1]/10 bg-[#0B0D12]/95 px-3.5 pr-[144px] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[#F4F6FA]">
        <span className="flex h-4 w-4 items-center justify-center rounded-md bg-[#8B5CF6]/20 text-[#00E5FF]">
          <Disc3 className="h-3 w-3" />
        </span>
        <span className="font-display">HnBeeMusic</span>
        <span className="rounded-full border border-[#00E5FF]/25 bg-[#00E5FF]/10 px-1.5 py-0.5 font-mono text-[9px] text-[#00E5FF]">
          HNT &bull; HNM
        </span>
      </div>
    </div>
  );
}
