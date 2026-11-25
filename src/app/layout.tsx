import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { AmbientGlow } from "@/components/player/AmbientGlow";
import { AudioEngineManager } from "@/components/player/AudioEngineManager";
import { BottomPlayerBar } from "@/components/player/BottomPlayerBar";
import { QueueDrawer } from "@/components/player/QueueDrawer";
import { LyricsPanel } from "@/components/player/LyricsPanel";
import { FullScreenLyricsModal } from "@/components/player/FullScreenLyricsModal";
import { FullScreenPlayerModal } from "@/components/player/FullScreenPlayerModal";
import { ApiSettingsModal } from "@/components/settings/ApiSettingsModal";
import { AuthModal } from "@/components/auth/AuthModal";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HnBee Music — Unified Multi-Source Streaming",
  description:
    "Open-source multi-source music streaming client for Spotify, YouTube, and SoundCloud.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#09090b] font-sans text-zinc-100 antialiased selection:bg-emerald-400/30 selection:text-white">
        <MotionProvider>
          <AmbientGlow />
          <Sidebar />

          {/* Main scrollable viewport: flex-1 overflow-y-auto pb-32, desktop offset for w-64 m-2 sidebar */}
          <main className="min-h-screen flex-1 overflow-y-auto pb-36 md:pb-32 md:pl-[272px]">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
              {children}
            </div>
          </main>

          {/* Persistent Global Audio Engine & Glassmorphism Player Overlays */}
          <AudioEngineManager />
          <BottomPlayerBar />
          <QueueDrawer />
          <LyricsPanel />
          <FullScreenLyricsModal />
          <FullScreenPlayerModal />
          <ApiSettingsModal />
          <AuthModal />
        </MotionProvider>
      </body>
    </html>
  );
}
