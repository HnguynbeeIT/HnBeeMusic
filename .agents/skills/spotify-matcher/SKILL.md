---
name: spotify-matcher
description: >-
  Use when implementing or debugging Spotify URL/Playlist/Album pasting,
  metadata extraction, and lazy Spotify-to-YouTube/SoundCloud audio stream
  matching in HnBeeMusic.
---

# Skill: Spotify Matcher

## Trigger
Khi xử lý tính năng dán link Spotify (Track/Playlist/Album) để phát nhạc trên web.

## Instructions
1. **URL Parsing**: Dùng Regex trích xuất loại tài nguyên (`track`, `playlist`, `album`) và `id` từ URL Spotify (`open.spotify.com/(intl-xx/)?(track|playlist|album)/([a-zA-Z0-9]+)`).
2. **Metadata Extraction**: Gọi Spotify Web API (server-side với Client Credentials token được cache, hoặc oEmbed fallback cho single track khi chưa có key) để lấy `title`, `artist`, `thumbnail`, `duration_ms` và chuyển sang `UnifiedTrack`.
3. **Lazy Stream Matching**:
   - **KHÔNG** tìm kiếm YouTube/SoundCloud cho toàn bộ playlist cùng lúc để tránh cạn API quota.
   - Chỉ khi user bấm phát bài nào (và tùy chọn prefetch 1 bài kế tiếp trong queue) mới gọi `/api/resolve` để tìm nguồn phát với truy vấn: `"[Artist] - [Title] Official Audio"`.
   - **Scoring & Filtering**: Ưu tiên kết quả có độ lệch thời lượng `< 5s` so với `duration` gốc của Spotify, và loại bỏ các kết quả chứa từ khóa nhiễu (`cover`, `remix`, `live`, `reaction`, `karaoke`, `nightcore`, `slowed`) trừ khi tên bài hát gốc có chứa từ đó.
   - Cache kết quả mapping bằng `unstable_cache` theo `spotifyTrackId`.
