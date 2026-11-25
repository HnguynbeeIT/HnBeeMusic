# Project Rules: HnBeeMusic (Open Source & Self-Hosting)

## 1. Tech Stack & Architecture
- **Framework**: Next.js (App Router) + TypeScript.
- **Styling**: Tailwind CSS + Lucide Icons + Framer Motion (Audiophile Glassmorphism Dark Mode `#09090b`, 60fps GPU-accelerated animations).
- **State Management**: Zustand (`usePlayerStore` cho Global Audio Player, `useSettingsStore` cho BYOK API Keys lưu cục bộ).
- **Database / Persistence**: Tùy chọn `DATABASE_URL` (Supabase / Neon PostgreSQL). Nếu để trống, ứng dụng BẮT BUỘC hoạt động mượt mà với `localStorage` (zero-config self-hosting).

## 2. Audio Engine & Source Constraints (BẮT BUỘC)
- **Unified Player Interface**: Mọi nguồn nhạc chuẩn hóa về `UnifiedTrack`:
  `{ id, title, artist, thumbnail, duration, source: 'youtube' | 'soundcloud' | 'spotify', sourceUrl, streamUrl?, resolvedSource? }`
- **YouTube**: Không dùng `ytdl-core` ở client; dùng `react-youtube` (IFrame API) ẩn hoặc proxy stream hợp lệ phía server.
- **SoundCloud**: Dùng SoundCloud Widget API hoặc API route nội bộ `/api/stream/soundcloud` có cache.
- **Spotify**: Chỉ dùng Spotify Web API lấy metadata/playlist; dùng Lazy Stream Matching để map sang YouTube/SoundCloud khi phát.
- **Persistence**: `AudioEngineHost` và `BottomPlayerBar` đặt trong Root Layout (`src/app/layout.tsx`) để không ngắt nhạc khi chuyển trang.

## 3. Open Source & Self-Hosting Rules (MIT License)
- **Giấy phép**: Phát hành công khai dưới giấy phép **MIT License** (`LICENSE`). Không chèn mã nguồn độc quyền hoặc thư viện có license xung đột.
- **Zero Hardcoded Secrets**: Tuyệt đối không commit API Keys, token hoặc chuỗi kết nối DB vào Git. `.gitignore` bắt buộc chặn `.env`, `.env.local`, `.env*.local`, `.next/`, `node_modules/`.
- **BYOK (Bring Your Own Key)**:
  - Hỗ trợ người dùng tự nhập API Keys cá nhân qua **API Settings Modal** trên giao diện web (chỉ lưu trong `localStorage` của trình duyệt người dùng).
  - Key cá nhân được gửi qua HTTP request headers nội bộ (`x-youtube-api-key`, `x-spotify-client-id`, `x-spotify-client-secret`, `x-soundcloud-client-id`) tới Next.js Route Handlers; server tuyệt đối KHÔNG log và KHÔNG lưu key cá nhân của người dùng.
  - Không bao giờ expose server API keys qua biến `NEXT_PUBLIC_`.
- **Zero-Config Ready**: Ứng dụng phải chạy được ngay sau `npm install && npm run dev` mà không cần bắt buộc cài DB hay API keys (có danh mục mẫu đa nguồn + oEmbed fallback + LocalStorage).
- **Miễn trừ trách nhiệm bản quyền**: Không host hay phân phối lại file âm thanh bản quyền; chỉ phát qua trình nhúng/API hợp lệ từ YouTube, SoundCloud và metadata công khai từ Spotify.

## 4. Zero-Verification Auth & Dual-Mode Architecture
- **No-Verification Auth**: Đăng ký tài khoản chỉ yêu cầu `username` (chữ thường, số, dấu gạch dưới, tối thiểu 3 ký tự), `displayName` (tùy chọn) và `password`. Tuyệt đối không yêu cầu xác minh email, OTP hay số điện thoại.
- **Dual-Mode Auth Architecture**:
  - Có `process.env.DATABASE_URL` (**Cloud DB Sync**): Lưu tài khoản vào PostgreSQL, mã hóa mật khẩu bằng `bcryptjs`, cấp phiên đăng nhập qua HTTP-only Cookie JWT bằng `jose`.
  - Không có `process.env.DATABASE_URL` (**Local Browser Profile**): Tự động chuyển sang **Local Account Mode**, lưu tài khoản và dữ liệu playlist/liked songs vào `localStorage` kèm tính năng Export/Import `.json` để người clone repo chạy ngay không lỗi.
- **Anti-Spam Rate Limiting**: Giới hạn tốc độ đăng ký theo IP tại `POST /api/auth/register` (tối đa 5 tài khoản/giờ/IP).

