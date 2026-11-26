"use client";

import dynamic from "next/dynamic";

const QueueDrawer = dynamic(
  () => import("@/components/player/QueueDrawer").then((m) => m.QueueDrawer),
  { ssr: false }
);
const FullScreenLyricsModal = dynamic(
  () =>
    import("@/components/player/FullScreenLyricsModal").then(
      (m) => m.FullScreenLyricsModal
    ),
  { ssr: false }
);
const FullScreenPlayerModal = dynamic(
  () =>
    import("@/components/player/FullScreenPlayerModal").then(
      (m) => m.FullScreenPlayerModal
    ),
  { ssr: false }
);
const ApiSettingsModal = dynamic(
  () =>
    import("@/components/settings/ApiSettingsModal").then(
      (m) => m.ApiSettingsModal
    ),
  { ssr: false }
);
const AuthModal = dynamic(
  () => import("@/components/auth/AuthModal").then((m) => m.AuthModal),
  { ssr: false }
);
const CreatePlaylistModal = dynamic(
  () =>
    import("@/components/playlist/CreatePlaylistModal").then(
      (m) => m.CreatePlaylistModal
    ),
  { ssr: false }
);
const AboutModal = dynamic(
  () => import("@/components/AboutModal").then((m) => m.AboutModal),
  { ssr: false }
);
const IOSInstallBanner = dynamic(
  () =>
    import("@/components/pwa/IOSInstallBanner").then(
      (m) => m.IOSInstallBanner
    ),
  { ssr: false }
);

/**
 * Dynamically lazy-loaded overlay modals & drawers to minimize initial JS payload
 * on 4G mobile networks while keeping RootLayout crisp and responsive.
 */
export function LazyModals() {
  return (
    <>
      <QueueDrawer />
      <FullScreenLyricsModal />
      <FullScreenPlayerModal />
      <ApiSettingsModal />
      <AuthModal />
      <CreatePlaylistModal />
      <AboutModal />
      <IOSInstallBanner />
    </>
  );
}
