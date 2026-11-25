# Skill: Audio Source Adapter

## Trigger
Khi cần tích hợp nguồn nhạc mới (YouTube, SoundCloud, Spotify) hoặc sửa lỗi lấy metadata/luồng phát nhạc.

## Instructions
1. Tạo/cập nhật adapter tại `src/lib/adapters/[source].ts`.
2. Mọi hàm tìm kiếm và lấy thông tin bài hát BẮT BUỘC trả về chuẩn `UnifiedTrack`:
   ```ts
   export interface UnifiedTrack {
     id: string;
     title: string;
     artist: string;
     thumbnail: string;
     duration: number; // tính bằng giây
     source: 'youtube' | 'soundcloud' | 'spotify';
     sourceUrl: string;
     streamUrl?: string;
   }
   ```
3. Tuân thủ ràng buộc nguồn phát:
   - **YouTube**: Không dùng `ytdl-core` ở client; dùng `react-youtube` (IFrame API) ẩn hoặc proxy stream hợp lệ phía server/edge.
   - **SoundCloud**: Dùng SoundCloud Widget API hoặc `/api/stream/soundcloud` có cache.
   - **Spotify**: Lấy metadata/playlist qua Spotify API, sau đó map sang audio stream từ YouTube/SoundCloud.
4. Không expose API Keys ra client (`NEXT_PUBLIC_`) và luôn cache kết quả bằng `unstable_cache` hoặc Redis/Upstash.
