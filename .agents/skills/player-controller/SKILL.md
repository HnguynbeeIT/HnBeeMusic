---
name: player-controller
description: >-
  Use when building or modifying playback controls, track switching, seeking,
  queue management, Media Session integration, or state synchronization across
  audio engines in HnBeeMusic.
---

# Skill: Player Controller

## Trigger
Khi xây dựng hoặc chỉnh sửa logic điều khiển phát nhạc, chuyển bài, tua nhạc (seek), hoặc đồng bộ trạng thái giữa các trình phát.

## Instructions
1. **Single Active Engine**: Tại một thời điểm chỉ có duy nhất 1 audio engine được phát. Khi chuyển nguồn (YouTube <-> SoundCloud hoặc giữa các adapter), engine cũ PHẢI gọi `.pause()` và đưa `currentTime = 0` trước khi engine mới gọi `.play()`.
2. **State Sync (Zustand)**: Đồng bộ toàn bộ trạng thái (`isLoading`, `isPlaying`, `progress`, `duration`, `volume`, `isMuted`, `sourceType`, `currentTrack`, `queue`) vào `usePlayerStore`.
3. **Auto-Next**: Lắng nghe sự kiện `onEnded` trên mọi engine để tự động gọi `playNext()` (tôn trọng `repeatMode`: `one`, `all`, `off` và `isShuffle`).
4. **Media Session API**: Cập nhật `navigator.mediaSession.metadata` (`title`, `artist`, `artwork`) và đăng ký action handlers (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`) mỗi khi đổi bài.
5. **Persistence**: Mount `AudioEngineHost` và `BottomPlayerBar` duy nhất 1 lần trong Root Layout (`src/app/layout.tsx`) để đảm bảo chuyển trang không ngắt nhạc.
