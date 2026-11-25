# Project Rules: Multi-Source Music Streaming App (HnBeeMusic)

## 1. Tech Stack & Architecture
- **Framework**: Next.js (App Router) + TypeScript.
- **Styling**: Tailwind CSS + Lucide Icons (Dark mode mặc định, giao diện tối giản chuẩn audiophile/streaming).
- **State Management**: Zustand (quản lý Global Audio Player: `currentTrack`, `queue`, `isPlaying`, `volume`, `progress`, `sourceType`).
- **Database / Auth**: Supabase hoặc Neon PostgreSQL (lưu Playlist cá nhân, Lịch sử nghe, Liked Songs).

## 2. Audio Engine & Source Constraints (BẮT BUỘC)
- **Unified Player Interface**: Mọi nguồn nhạc phải được chuẩn hóa về một cấu trúc dữ liệu chung (`UnifiedTrack`):
  ```ts
  export type TrackSource = 'youtube' | 'soundcloud' | 'spotify';

  export interface UnifiedTrack {
    id: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration: number; // seconds
    source: TrackSource;
    sourceUrl: string;
    streamUrl?: string;
  }
  ```
- **YouTube**: Không tự ý dùng thư viện `ytdl-core` phía client vì lỗi CORS và dễ bị block IP. Sử dụng `react-youtube` (IFrame API) ẩn hoặc proxy stream hợp lệ phía server/edge.
- **SoundCloud**: Sử dụng SoundCloud Widget API hoặc stream extractor qua API route nội bộ (`/api/stream/soundcloud`) có cache.
- **Spotify**: Spotify Web API không trả về full audio stream miễn phí (chỉ trả về 30s preview hoặc yêu cầu Spotify Web Playback SDK với tài khoản Premium). **Quy tắc xử lý**: Dùng Spotify API để lấy metadata/playlist, sau đó map sang audio stream từ YouTube/SoundCloud (nếu user không dùng tài khoản Spotify Premium).
- **Persistence**: Thanh phát nhạc (Bottom Player Bar) phải nằm ở Root Layout (`layout.tsx`) để không bị ngắt nhạc khi chuyển trang.

## 3. Code Quality & Performance
- Luôn dùng Debounce (300ms-500ms) cho thanh tìm kiếm (Search Bar) để tiết kiệm quota API.
- Cache kết quả tìm kiếm và metadata bài hát bằng Next.js `unstable_cache` hoặc Redis/Upstash.
- Không expose API Keys (Spotify Client Secret, YouTube Data API Key) ở phía Client (`NEXT_PUBLIC_`).
