---
name: ui-designer
description: Thiết kế và xây dựng giao diện ứng dụng nghe nhạc đa nguồn chuẩn thẩm mỹ Audiophile Glassmorphism, ánh sáng động và animation 60fps bằng Framer Motion.
---

# Skill: Audiophile UI/UX & Motion Designer

## 1. Hệ thống màu sắc & Ánh sáng động (Dynamic Ambient Lighting)
- **Nền chính**: Đen sâu `bg-[#09090b]` để tôn ảnh bìa album.
- **Dynamic Ambient Glow**: Phía sau vùng nội dung chính, đặt lớp nền ánh sáng tỏa mờ (`blur-[120px] opacity-30 transition-all duration-1000`) tự động đổi màu theo tông màu chủ đạo của ảnh bìa bài hát đang phát.
- **Glassmorphism Surfaces**: Sidebar, Card, Bottom Player và Drawer dùng kính mờ `bg-zinc-900/60 backdrop-blur-xl border border-white/10`.
- **Màu nhận diện nguồn phát (Source Badges & Progress)**:
  - Spotify: Xanh lá (`#1DB954` / `text-emerald-400` / `bg-emerald-500/10`)
  - YouTube: Đỏ (`#FF0000` / `text-rose-500` / `bg-rose-500/10`)
  - SoundCloud: Cam (`#FF5500` / `text-orange-400` / `bg-orange-500/10`)

## 2. Bố cục không gian & Responsive Shell
- **Desktop (`md:` trở lên)**:
  - **Sidebar trái (`w-64 m-2 rounded-2xl`)**: Logo thương hiệu, thanh tìm kiếm nhanh, menu điều hướng (Khám phá, Trending, Thư viện) và danh sách Playlist có thumbnail.
  - **Main View (`flex-1 overflow-y-auto pb-32`)**:
    - *Hero Banner*: Bài hát/playlist nổi bật với ảnh bìa đổ bóng sâu (`shadow-2xl`), nút Play tròn lớn phát sáng.
    - *Source Filter Tabs*: Bộ lọc dạng pill (`Tất cả`, `Spotify`, `YouTube`, `SoundCloud`).
    - *Track List*: Hàng bài hát thoáng (`hover:bg-white/5`), ảnh bìa `rounded-md` gắn badge nguồn ở góc, thời lượng dùng font `tabular-nums`, bài đang phát hiển thị sóng nhạc Equalizer thay số thứ tự.
  - **Floating Glass Player Bar (`fixed bottom-3 inset-x-3 h-22 rounded-2xl z-50 grid-cols-3`)**:
    - *Trái*: Ảnh bìa vuông bo góc, tên bài hát (chạy marquee nếu quá dài), tên nghệ sĩ, badge nguồn.
    - *Giữa*: Cụm nút điều khiển (Shuffle, Prev, Play/Pause trắng nổi bật, Next, Repeat) + Thanh Seekbar mảnh (`h-1 hover:h-2`), tự đổi màu thanh tiến trình theo nguồn đang phát.
    - *Phải*: Nút mở Queue Drawer, nút Lyrics, thanh chỉnh âm lượng.
- **Mobile (`< md`)**:
  - Chuyển Sidebar thành Bottom Navigation Bar nằm dưới Mini Player nổi (`bottom-16`). Bấm vào Mini Player mở ra Full-screen Player Modal.

## 3. Quy chuẩn Motion & Animation (60fps GPU-Accelerated)
- **Hiệu năng**: Chỉ animate `transform`, `opacity`, `clip-path` bằng `framer-motion`. Không animate `width`/`height`/`top`/`left`.
- **Spring Physics**: Dùng cấu hình chuẩn `type: "spring", stiffness: 380, damping: 32, mass: 0.8`.
- **Shared Layout (`layoutId`)**:
  - Thanh nền trượt mượt giữa các tab nguồn nhạc (`layoutId="activeSourceTab"`).
  - Thanh highlight menu bên Sidebar (`layoutId="sidebarActive"`).
  - Ảnh bìa bay liền mạch từ Mini Player lên Full-screen Modal (`layoutId="playerArtwork"`).
- **Hiệu ứng trình phát**:
  - Khi `isPlaying === true`: Ảnh bìa phóng to nhẹ (`scale: 1.05`) kèm glow theo màu nguồn; component `<AudioEqualizer />` 3 cột chạy `scaleY` lệch pha lặp vô tận (`repeat: Infinity`). Khi Pause hạ mượt về trạng thái tĩnh.
- **Stagger & Drawers**:
  - Danh sách bài hát xuất hiện nối tiếp (`staggerChildren: 0.03`, `y: 12 -> 0`, `opacity: 0 -> 1`).
  - Queue Drawer và Lyrics Panel bọc trong `<AnimatePresence>`, trượt mượt từ cạnh phải (`x: "100%" -> 0`, `ease: [0.22, 1, 0.36, 1]`).
  - Mọi nút bấm đều có `whileHover={{ scale: 1.08 }}` và `whileTap={{ scale: 0.92 }}`.
- **Trạng thái & Fallback**: Dùng Skeleton Loader (`animate-pulse`) khi tải dữ liệu; mọi thẻ `<img>` đều có `onError` fallback sang ảnh gradient mặc định.
