<div align="center">

<img src="./logo/logo%20w.png" alt="HnBee Music" width="110" />

# HnBee Music

**Unified Multi-Source Audiophile Music Streaming — Hợp nhất Spotify, YouTube, SoundCloud, Zing MP3, NhacCuaTui & Apple Music trong một không gian Glassmorphism 60fps.**

[![MIT License](https://img.shields.io/badge/License-MIT-10B981.svg)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15_App_Router-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5_Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Electron Desktop](https://img.shields.io/badge/Electron-Desktop_(.exe)-47848F?logo=electron&logoColor=white)](https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest)

<br />

<a href="https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest/download/HnBee-Music-Setup.exe">
  <img src="https://img.shields.io/badge/Download_for_Windows-v2.5.1_(.exe)-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows v2.5.1 (.exe)" />
</a>
&nbsp;
<a href="https://hnbeemusic.vercel.app/download">
  <img src="https://img.shields.io/badge/All_Platforms-iOS_%E2%80%A2_Android_%E2%80%A2_PC-10B981?style=for-the-badge&logo=googlechrome&logoColor=white" alt="All Platforms — iOS, Android, PC" />
</a>
&nbsp;
<a href="https://hnbeemusic.vercel.app">
  <img src="https://img.shields.io/badge/Open_Web_Player-Live_App-18181B?style=for-the-badge&logo=vercel&logoColor=white" alt="Open Web Player — Live App" />
</a>

</div>

---

## Tính năng nổi bật (Key Highlights)

- **Multi-Source Unified Audio Engine:** Tìm kiếm, dán link và phát liền mạch bài hát từ **Spotify, YouTube, SoundCloud, Zing MP3, NhacCuaTui, Apple Music & Audius** trên cùng một hàng đợi (`UnifiedTrack`), không bị ngắt nhạc khi chuyển trang.
- **Audio Stream Proxy (`HTTP 206 Partial Content`):** Hỗ trợ tua nhạc mượt mà, đính kèm anti-hotlink headers (`Referer`, `User-Agent`, `Cookie`) phía server qua `/api/stream/:unifiedId`, `/api/providers/zingmp3`, `/api/providers/nhaccuatui`, `/api/providers/audius` và `/api/audio-proxy`.
- **Crossfade & Smart Gapless Preload:** Tùy chỉnh chuyển bài mượt `0s–8s`, tự động tải trước bài hát kế tiếp, cơ chế **Single Active Engine** triệt tiêu chồng âm và **SponsorBlock** tự động bỏ qua đoạn quảng cáo/intro trong MV YouTube.
- **Synced Lyrics thời gian thực (Karaoke Mode):** Đồng bộ từng câu theo thời gian thực qua **LRCLIB** và lời đồng bộ `.lrc` gốc từ **Zing MP3 / NhacCuaTui**, chạm vào từng dòng lời để tua tức thì.
- **OAuth Cloud Sync & BYOK:** Đăng nhập bằng **Google / Facebook** để đồng bộ tự động Playlist cá nhân, Bài hát đã thích và Nghệ sĩ theo dõi giữa máy tính & điện thoại; hỗ trợ **BYOK (Bring Your Own Key)** ngay trên giao diện Settings.
- **Trải nghiệm Gốc trên Windows & Di động:** Bản **Windows Desktop (`.exe`)** có Frameless Dark TitleBar, System Tray chạy nền, Taskbar Thumbnail Controls (`Bài trước`, `Phát/Tạm dừng`, `Bài tiếp`), phím Media vật lý & OAuth Deep Link (`hnbeemusic://`); bản **iOS / Android PWA** tối ưu phát nhạc nền tắt màn hình & Dynamic Island.

---

## Bảng So Sánh Nền Tảng & Tính Năng (Supported Platforms Matrix)

| Nền tảng (Platform) | Tìm kiếm (Search) | Import Link / Playlist | Lyrics đồng bộ (Synced `.lrc`) | Chạy nền iOS / Android / Windows | Cơ chế phát (Stream Mode) |
|---|:---:|:---:|:---:|:---:|---|
| **Spotify** | ✅ | ✅ Track / Playlist / Album / Artist | ✅ (LRCLIB) | ✅ | Metadata + Lazy Bridge (YouTube / SoundCloud) |
| **YouTube** | ✅ | ✅ Video / Playlist | ✅ (LRCLIB) | ✅ | `youtubei.js` Direct Audio Proxy + IFrame Fallback |
| **SoundCloud** | ✅ | ✅ Track / Shortlink | ✅ (LRCLIB) | ✅ | Direct Progressive MP3 / HLS + Widget Fallback |
| **Zing MP3** | ✅ | ✅ Bài hát / Album / Playlist | ✅ Native `.lrc` + LRCLIB | ✅ | Server Proxy `/api/providers/zingmp3` (HMAC-SHA512, HTTP 206) |
| **NhacCuaTui** | ✅ | ✅ Bài hát (`nhaccuatui.com`) | ✅ Native `.lrc` + LRCLIB | ✅ | Server Proxy `/api/providers/nhaccuatui` (Token + XML, HTTP 206) |
| **Apple Music** | ✅ | ✅ Track / Album / Playlist | ✅ (LRCLIB) | ✅ | MusicKit / iTunes Metadata + Fallback Bridge (YouTube / Zing MP3) |
| **Audius** | ✅ | ✅ Track / Playlist (`audius.co`) | ✅ (LRCLIB) | ✅ | Direct Open Discovery API `/api/providers/audius` (Zero-OAuth) |

---

## Hướng Dẫn Cài Đặt Nhanh Trên Từng Thiết Bị (Quick Install)

### Windows Desktop (`.exe` — Windows 10/11 64-bit)
1. Nhấn nút **[Download for Windows v2.5.1 (.exe)](https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest/download/HnBee-Music-Setup.exe)** ở đầu trang (hoặc tải bản chạy ngay [HnBee-Music-Portable.exe](https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest/download/HnBee-Music-Portable.exe)).
2. Chạy tệp **`HnBee-Music-Setup.exe`** để cài đặt và tự động tạo lối tắt Desktop & Start Menu.
3. > **Lưu ý Windows SmartScreen:** Do bộ cài mã nguồn mở đang trong quá trình hoàn tất chứng chỉ ký số EV, nếu Windows hiện hộp thoại xanh *"Windows protected your PC"*, hãy bấm **More info (Thông tin thêm)** → **Run anyway (Vẫn chạy)** để cài đặt bình thường.

### iOS (iPhone / iPad — Safari)
1. Mở **[https://hnbeemusic.vercel.app](https://hnbeemusic.vercel.app)** bằng trình duyệt **Safari**.
2. Chạm vào biểu tượng **Chia sẻ (Share)** ở thanh dưới cùng → chọn **Thêm vào Màn hình chính (Add to Home Screen)** → bấm **Thêm (Add)**.
3. Mở biểu tượng **HnBee Music** từ Màn hình chính để tận hưởng giao diện toàn màn hình mượt mà và nghe nhạc nền khi tắt màn hình.

### Android (Google Chrome / Edge)
1. Mở **[https://hnbeemusic.vercel.app](https://hnbeemusic.vercel.app)** bằng **Chrome**.
2. Chạm biểu tượng menu **⋮** ở góc trên bên phải → chọn **Cài đặt ứng dụng (Install app)** hoặc **Thêm vào Màn hình chính**.

---

## Kiến Trúc Hệ Thống & Tự Build (Local Development & Architecture)

```text
+---------------------------------------------------------------------------------+
|                      CLIENT (Web / iOS PWA / Electron .exe)                     |
|   Next.js 15 App Router  |  Zustand Stores  |  AudioEngineManager & Player Bar  |
+---------------------------------------+-----------------------------------------+
                                        |
                Search / Resolve URL    |   Stream Audio (Range: bytes=0-)
                                        v
+---------------------------------------------------------------------------------+
|                  NEXT.JS SERVERLESS API & STREAM PROXY LAYER                    |
|   /api/search  |  /api/resolve  |  /api/stream/:unifiedId  |  /api/providers/*  |
+---------------------------------------+-----------------------------------------+
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                UNIFIED ADAPTER & AGGREGATOR LAYER (src/adapters/)               |
|   BaseAdapter (5000ms Timeout, 1x Retry) + AggregatorService (TTL Stream Cache) |
|   Spotify | YouTube | SoundCloud | Zing MP3 | NhacCuaTui | Apple Music | Audius |
+---------------------------------------------------------------------------------+
```

### Chạy dự án trên máy cá nhân (Local Development)
Yêu cầu: **Node.js 20+** và **npm**.

```bash
# 1. Clone repository
git clone https://github.com/HnguynbeeIT/HnBeeMusic.git
cd HnBeeMusic

# 2. Cài đặt dependencies
npm install

# 3. Tạo file cấu hình môi trường (tùy chọn — có thể để trống để chạy Zero-Key Mode)
cp .env.example .env.local

# 4. Khởi chạy môi trường phát triển
npm run dev
```

Mở **[http://localhost:3000](http://localhost:3000)** để trải nghiệm.

| Lệnh (`package.json`) | Chức năng |
|---|---|
| `npm run dev` | Chạy máy chủ phát triển Next.js tại `http://localhost:3000` |
| `npm run typecheck` | Kiểm tra kiểu TypeScript nghiêm ngặt (`tsc --noEmit`) |
| `npm run lint` | Kiểm tra chuẩn mã nguồn với ESLint |
| `npm run build` | Biên dịch bản Production tối ưu (`next build`) |
| `npm run start` | Khởi chạy bản Production sau khi build |
| `npm run build:exe` | Đóng gói `HnBee-Music-Setup.exe` & `HnBee-Music-Portable.exe` (Windows x64) |

---

## Đóng Góp Mã Nguồn & Viết Thêm `AudioAdapter` Mới (Contributing)

Cộng đồng hoàn toàn có thể mở rộng thêm nền tảng mới (Deezer, Tidal, Bandcamp, Jamendo...) thông qua Pull Request hoặc Issue:

1. **Fork & tạo nhánh mới:** `git checkout -b feat/adapter-<platform>`
2. **Triển khai Adapter:** Tạo file `src/adapters/<platform>.adapter.ts` kế thừa `BaseAdapter` (`src/adapters/base.adapter.ts`) và đáp ứng interface `AudioAdapter` (`canHandleUrl`, `search`, `resolveUrl`, `getStreamUrl`, `getLyrics`).
3. **Đăng ký Adapter & URL Parser:** Thêm pattern nhận diện URL vào `src/lib/audio/url-parser.ts`, màu nhận diện tại `src/lib/ui/source-theme.ts` và đăng ký vào `src/lib/adapters/extended-providers.ts` / `src/adapters/index.ts`.
4. **Cấu hình mẫu:** Nếu cần API key, chỉ thêm tên biến (giá trị rỗng) vào `.env.example`, tuyệt đối không commit `.env.local`.
5. **Kiểm tra & mở Pull Request:** Chạy `npm run typecheck && npm run build` đảm bảo 0 lỗi trước khi tạo Pull Request.

Xem thêm hướng dẫn chi tiết tại [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md) và [CHANGELOG.md](./CHANGELOG.md).

---

## Miễn Trừ Trách Nhiệm (Disclaimer)

- **HnBee Music** là dự án mã nguồn mở phục vụ mục đích học tập, nghiên cứu kiến trúc phần mềm và trải nghiệm nghe nhạc cá nhân.
- Ứng dụng không lưu trữ và không phân phối tệp âm thanh có bản quyền trên máy chủ riêng; mọi luồng phát và metadata đều được kết nối trực tiếp từ các nền tảng gốc theo yêu cầu của người dùng.

## Tác Giả & Bản Quyền (Author & Organization)

- **Tác giả:** **Nguyễn Ngọc Hà Nguyên** — `@_hnguynbee.hng_` ([HnguynbeeIT](https://github.com/HnguynbeeIT))
- **Đơn vị phát triển:** **HNT - HnBee Technologies** &bull; *A division of **Hyper Next Generation (HNG)***
- **Portfolio:** [hanguynbeeit-portfolio.vercel.app](https://hanguynbeeit-portfolio.vercel.app)
- **Giấy phép:** Phát hành dưới giấy phép **[MIT License](./LICENSE)** &copy; 2026 **Nguyễn Ngọc Hà Nguyên — HNT - HnBee Technologies | Hyper Next Generation (HNG)**.
