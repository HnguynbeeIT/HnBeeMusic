---
name: audio-adapter
description: >-
  Use when integrating a new music source (YouTube, SoundCloud, Spotify) or
  debugging metadata fetching, thumbnail normalization, and audio stream
  resolution in HnBeeMusic.
---

# Skill: Audio Source Adapter

## Trigger
Khi cần tích hợp nguồn nhạc mới (YouTube, SoundCloud, Spotify) hoặc sửa lỗi lấy metadata/luồng phát nhạc.

## Instructions
1. **Vị trí file**: Tạo/cập nhật adapter tại `src/lib/adapters/[source].ts` (`youtube.ts`, `soundcloud.ts`, `spotify.ts`).
2. **Chuẩn hóa dữ liệu (`UnifiedTrack`)**: Mọi hàm tìm kiếm và lấy thông tin bài hát BẮT BUỘC trả về chuẩn `UnifiedTrack`:
   ```ts
   export type TrackSource = 'youtube' | 'soundcloud' | 'spotify';

   export interface UnifiedTrack {
     id: string;
     title: string;
     artist: string;
     thumbnail: string;
     duration: number; // tính bằng giây
     source: TrackSource;
     sourceUrl: string;
     streamUrl?: string;
     resolvedSource?: 'youtube' | 'soundcloud';
   }
   ```
3. **Chuẩn hóa Thumbnail**: Tự động nâng cấp chất lượng ảnh bìa trước khi trả về:
   - **YouTube**: Đổi `default.jpg`, `mqdefault.jpg`, hoặc `hqdefault.jpg` thành `maxresdefault.jpg` (có fallback về `hqdefault.jpg` ở UI `onError`).
   - **SoundCloud**: Đổi `-large` thành `-t500x500`.
4. **Error Handling**: Bọc toàn bộ lời gọi API bên ngoài trong `try/catch`, ghi log có kiểm soát phía server và trả về mảng rỗng `[]` khi một nguồn lỗi hoặc hết quota để không làm sập kết quả tìm kiếm từ các nguồn khác.
5. **Ràng buộc nguồn phát & Bảo mật**:
   - **YouTube**: Không dùng `ytdl-core` ở client; dùng `react-youtube` (IFrame API) ẩn hoặc proxy stream hợp lệ phía server/edge.
   - **SoundCloud**: Dùng SoundCloud Widget API hoặc stream extractor qua API route nội bộ (`/api/stream/soundcloud`) có cache.
   - **Spotify**: Chỉ dùng Spotify Web API để lấy metadata/playlist, sau đó map sang audio stream từ YouTube/SoundCloud.
   - Không expose API Keys qua `NEXT_PUBLIC_`; cache kết quả bằng Next.js `unstable_cache` (hoặc Redis/Upstash).
