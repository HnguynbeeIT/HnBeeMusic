# Nhật ký Phát triển & Lịch sử Cập nhật — HnBee Music

Tài liệu này tổng hợp toàn bộ hành trình xây dựng, nâng cấp tính năng và vá lỗi của **HnBee Music** từ phiên bản khởi tạo (`v1.0.0`) đến phiên bản mới nhất (`v2.5.0`).

---

## [v2.5.0] — 2026-11-27 — Tái thiết kế Trang chủ, Bản Desktop Windows (.exe) & Sửa lỗi Mobile

### Tính năng mới
- **Tái thiết kế Trang chủ Dark Glassmorphism (`src/app/page.tsx`, `HomeCatalogClient.tsx`)**:
  - Lời chào theo khung giờ thực tế + **Quick Access Grid** (2 cột trên Mobile / 3 cột trên Desktop) truy cập nhanh *Bài hát đã thích*, *Dán link Playlist* và các Playlist gần đây.
  - **Hero Banner Featured Spotlight** với hiệu ứng *ambient glow* lấy màu từ ảnh bìa, nút **Phát ngay** & **Trộn bài** nổi bật.
  - Các dải khám phá ngang mượt mà (*Gợi ý hôm nay*, *Nghệ sĩ nổi bật*, *Tuyển chọn đa nền tảng Spotify • YouTube • SoundCloud*).
- **Đóng gói Ứng dụng Desktop Windows (`.exe`) bằng Electron (`desktop/`)**:
  - Hỗ trợ khung cửa sổ tối màu (`titleBarOverlay` / `hiddenInset`), **System Tray** thu gọn chạy nền khi bấm dấu X, **phím tắt Media vật lý** trên bàn phím (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`) và tự động mở khóa Autoplay.
  - Bổ sung script `npm run build:exe` và mẫu **GitHub Actions CI (`desktop/build-desktop.workflow.yml`)** tự động xuất `HnBee-Music-Setup.exe` & `HnBee-Music-Portable.exe` lên GitHub Releases.
- **Trang Tải xuống chuyên biệt (`/download`)**:
  - Giới thiệu 3 ưu điểm bản Desktop `.exe`, nút tải trực tiếp bản Release mới nhất kèm hướng dẫn Windows SmartScreen và hướng dẫn cài đặt nhanh PWA trên iOS / Android.
  - Đặt lối tắt **"Tải bản PC (.exe)"** trên Sidebar trái (Desktop), Cài đặt và Giới thiệu (Mobile).
- **Nhật ký Phát triển (`CHANGELOG.md`) & Mục *What's New* trong cửa sổ Giới thiệu (`AboutModal.tsx`)**.

### Sửa lỗi & Tối ưu Mobile
- **Sửa lỗi không thoát được màn hình Lời bài hát (Lyrics) trên iPhone**:
  - Cố định Header với `padding-top: max(env(safe-area-inset-top), 16px)` và `z-index: 9999` tránh Dynamic Island / Tai thỏ che nút đóng trên cả `LyricsPanel`, `FullScreenLyricsModal` và `FullScreenPlayerModal`.
  - Nâng kích thước nút đóng lên `48×48px` độ tương phản cao, hỗ trợ **vuốt xuống (Swipe Down)**, bấm `Escape` và chạm vùng nền bên ngoài để đóng tức thì.
- **Tối ưu giao diện màn hình dọc (`Portrait < 768px`)**:
  - Loại bỏ 100% tràn ngang (`overflow-x-hidden`), ẩn thanh cuộn trên các dải filter/carousel ngang (`.no-scrollbar`) và tăng khoảng đệm đáy `calc(140px + env(safe-area-inset-bottom))` để bài hát cuối không bị Mini Player và thanh 4 tab che khuất.

---

## [v2.4.0] — 2026-11-26 — Direct Audio Proxy, Khớp Bài Nghiêm Ngặt & Tối Ưu Tốc Độ (< 1.5s)

### Nâng cấp & Sửa lỗi Âm thanh
- **Direct Audio Stream Proxy (`/api/audio-proxy`) + Safe YouTube IFrame Fallback**:
  - Tích hợp `youtubei.js` kết hợp cụm SoundCloud / Audius / Piped / Invidious / Cobalt, hỗ trợ **HTTP Range (`206 Partial Content`)** và RAM Cache cho thẻ `<audio>` trên iOS.
  - Tự động rơi an toàn về YouTube IFrame (`1px x 1px`, `playsinline: 1`) nếu luồng proxy gặp lỗi hoặc quá `4s` — bảo toàn mốc thời gian hiện tại và tuyệt đối không nhảy bỏ bài.
  - Bổ sung cơ chế giữ phiên âm thanh nền (`visibilitychange` / `pause` Keep-Alive 50ms) và tự động gán thẳng `audio.src = nextProxyUrl` khi `onended` (không gọi `removeAttribute('src')`).
- **Thuật toán Khớp Bài Nghiêm Ngặt (`Strict Title & Artist Match`) & Cache `v2`**:
  - Chuẩn hóa tiếng Việt không dấu (`normalizeStr`), bắt buộc tiêu đề ứng viên chứa tên bài gốc (`score = -999` nếu không khớp, cấm tuyệt đối lấy bừa `results[0]`), lọc nhiễu (`remix`, `cover`, `karaoke`, `nhạc chế`, lệch > 60s), thử lại từ khóa `lyrics` và gắn log `[StreamMatch]`.
  - Nâng cấp bộ nhớ đệm lên `hnbee_stream_cache_v2` (tự động xóa sạch `hnbee_stream_cache_v1`) và cache server `hnbee-spotify-lazy-match-v3`.
- **Tăng tốc khởi phát < 1.5 giây**:
  - Áp đặt `AbortSignal.timeout(2500)`, đua song song InnerTube JSON + HTML `SOCS=CAI`, phân trang song song Spotify Playlist, preload ngầm bài kế tiếp ở mốc `3s` và bật HTTP Edge Cache (`s-maxage=3600`).

---

## [v2.3.0] — 2026-11-26 — Chuyển Bài Mượt (Crossfade), Cửa Sổ Giới Thiệu & Tổng Kiểm Tra Hiệu Năng

- **Crossfade & Smart Gapless Preload**: Tùy chỉnh thời lượng chuyển bài mượt (`0s–8s`) trong Cài đặt, tự động preload bài kế tiếp và hòa âm lượng mượt mà.
- **Tối ưu hiệu năng React & Mobile**: Tách `usePlaybackTimeStore` (triệt tiêu bão re-render 4 lần/giây), `LazyModals` bằng `next/dynamic`, chống lỗi SoundCloud iframe `postMessage` null.
- **Thiết kế lại `AboutModal.tsx`**: Tập trung vào câu chuyện thương hiệu và trải nghiệm người nghe, đặt điểm truy cập mượt trên cả Desktop và iPhone.

---

## [v2.2.0] — 2026-11-26 — Tối Ưu Hóa iOS Native-Grade PWA & Quản Lý Playlist Thư Viện

- **iOS Instant Audio Unlock & HIG 4-Tab Bar**: Mở khóa thẻ `<audio>` toàn cục tức thì ngay trong cú chạm tay đầu tiên (`ios-unlock.ts`), giao diện 4 tab dưới chuẩn iOS HIG, `IOSInstallBanner` và đồng bộ `navigator.mediaSession` cho Lock Screen & Dynamic Island.
- **Quản lý & Import Playlist cá nhân (`/library`, `/library/playlist/[id]`)**: Tạo, sửa, xóa, sắp xếp thứ tự bài hát, ghép lưới ảnh bìa 4 ô tự động, import thẳng từ link Playlist Spotify/YouTube/SoundCloud.
- **Vá triệt để lỗi Client-side Exception**: Giải mã an toàn `decodeURIComponent`, chuẩn hóa ID playlist `upl-...`, thêm bộ lọc `sanitize.ts` cho `localStorage` và trang `error.tsx` / `global-error.tsx`.

---

## [v2.1.0] — 2026-11-26 — Đăng Nhập Google/Facebook OAuth & Đồng Bộ Server Cloud Sync

- **Đăng nhập OAuth thực tế (Google & Facebook)** kết hợp JWT HttpOnly cookie (`/api/auth/signin/[provider]`, `/api/auth/callback/[provider]`).
- **Đồng bộ Đám mây (Server Cloud Sync)**: Kết nối PostgreSQL (Supabase), tự động đồng bộ và gộp thông minh Playlists cá nhân, Bài hát đã thích và Nghệ sĩ theo dõi giữa Máy tính và Điện thoại qua `/api/user/sync` và `CloudSyncManager`.

---

## [v2.0.0] — 2026-11-26 — Không Gian Nghệ Sĩ Hợp Nhất, Khu Vực Việt Nam & SponsorBlock

- **Trang Nghệ sĩ Hợp nhất (`/artist/[slug]`)**: Gộp danh mục bài hát đa nguồn (Spotify, YouTube, SoundCloud), hỗ trợ dán trực tiếp link Spotify Artist vào URL Resolver và nút Theo dõi nghệ sĩ.
- **Ưu tiên Khu vực & Ngôn ngữ (`RegionContext`)**: Mặc định Việt Nam (`VN`), bộ phân loại khu vực 4 tầng, Danh mục Nghệ sĩ 5 tab (*Việt Nam*, *US-UK*, *Hàn Quốc*, *Nhật Bản*, *Tất cả*) và Trending theo vùng.
- **SponsorBlock & Clean Audio Guard**: Tự động tua qua đoạn quảng cáo/intro/outro trong MV YouTube, dùng `youtube-nocookie.com`, tự nâng cấp bản nghe thử 30s Go+ của SoundCloud lên bản đầy đủ và bổ sung Zero-Key fallback cho Spotify Embed (`__NEXT_DATA__`) & YouTube (`ytInitialData`).
- **Chế độ Lời bài hát Karaoke Toàn màn hình (`FullScreenLyricsModal`)** đồng bộ theo thời gian thực qua LRCLIB.

---

## [v1.0.0] — 2026-11-26 — Khởi Tạo HnBee Music Đa Nguồn

- Xây dựng kiến trúc nền tảng Next.js App Router + TypeScript + Tailwind CSS + Framer Motion + Zustand.
- Chuẩn hóa mô hình dữ liệu `UnifiedTrack` hợp nhất 3 nguồn **Spotify**, **YouTube**, **SoundCloud** cùng thanh phát nhạc bền bỉ ở Root Layout, tìm kiếm đa nguồn có Debounce, API Settings (BYOK) và deploy bản phát hành đầu tiên lên Vercel (`https://hnbeemusic.vercel.app`).
