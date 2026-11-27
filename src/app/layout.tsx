import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { ElectronTitleBar } from "@/components/layout/ElectronTitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { AmbientGlow } from "@/components/player/AmbientGlow";
import { AudioEngineManager } from "@/components/player/AudioEngineManager";
import { BottomPlayerBar } from "@/components/player/BottomPlayerBar";
import { LyricsPanel } from "@/components/player/LyricsPanel";
import { CloudSyncManager } from "@/components/auth/CloudSyncManager";
import { LazyModals } from "@/components/layout/LazyModals";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "HnBeeMusic",
  title: "HnBeeMusic — Powered by HNT & HNM | HNG",
  description:
    "Unified multi-source audiophile music streaming for Spotify, YouTube, SoundCloud, Zing MP3, NhacCuaTui, Apple Music & Audius — Powered by HNT (Hyper Next Technologies) & HNM (Hyper Next Media), thuộc HNG (Hyper Next Generation Group).",
  authors: [
    {
      name: "Nguyễn Ngọc Hà Nguyên",
      url: "https://hng.vn",
    },
  ],
  creator: "HNT - Hyper Next Technologies & HNM - Hyper Next Media",
  publisher: "HNG — Hyper Next Generation Group",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HnBeeMusic",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0D12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen overflow-x-hidden bg-[#0B0D12] font-sans text-[#F4F6FA] antialiased selection:bg-[#00E5FF]/25 selection:text-[#F4F6FA]">
        <MotionProvider>
          <ElectronTitleBar />
          <AmbientGlow />
          <Sidebar />

          {/* Main scrollable viewport: portrait safe-area bottom cushion (140px + safe-area) so Mini Player + Nav never cover last track */}
          <main className="hnbee-main-viewport min-h-screen w-full flex-1 overflow-x-hidden overflow-y-auto pb-[calc(140px+env(safe-area-inset-bottom))] md:pb-32 md:pl-[272px]">
            <div className="mx-auto w-full max-w-5xl px-3.5 py-5 sm:px-8 sm:py-8">
              {children}
            </div>
          </main>

          {/* Persistent Global Audio Engine, Player Bar & Lazy-Loaded Modals */}
          <AudioEngineManager />
          <BottomPlayerBar />
          <LyricsPanel />
          <CloudSyncManager />
          <LazyModals />
        </MotionProvider>
      </body>
    </html>
  );
}
