# Chính Sách Bảo Mật — HnBee Music (Security Policy)

Tài liệu này mô tả kiến trúc bảo mật, nguyên tắc bảo vệ khóa bí mật (Secrets) trên kho mã nguồn công khai (`Public Repository`) và quy trình báo cáo lỗ hổng bảo mật cho **HnBee Music**.

---

## 1. Bảo Vệ Khóa Bí Mật & Biến Môi Trường (Secrets Hygiene)

- **Tuyệt đối không commit file `.env*`** chứa khóa thật lên Git. File `.gitignore` của dự án chặn toàn bộ `.env`, `.env.*` (chỉ ngoại lệ duy nhất `.env.example` với giá trị rỗng) cùng các tệp chứng chỉ/khóa ký (`*.pem`, `*.key`, `*.pfx`, `*.p12`).
- **Tách biệt tuyệt đối Client và Server**:
  - Toàn bộ bí mật (`SPOTIFY_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `AUTH_SECRET`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `HNBEE_SYNC_SECRET`) **chỉ được đọc ở phía Server** (Next.js API Routes & Server Modules), tuyệt đối không dùng tiền tố `NEXT_PUBLIC_` và không bao giờ được bundle vào JavaScript phía trình duyệt hoặc gói ứng dụng Desktop `desktop/dist/`.
  - Phiên đăng nhập sử dụng JWT ký `HS256` lưu trong **HttpOnly, SameSite=Lax, Secure Cookie** (`hnbee_session`).

### Quy Trình Xoay Vòng Khóa (Key Rotation) Nếu Nghi Ngờ Rò Rỉ
Nếu bất kỳ khóa API hoặc token nào bị lộ ngoài ý muốn:
1. Thu hồi (Revoke) và tạo khóa mới ngay trên **Google Cloud Console**, **Spotify Developer Dashboard**, **Meta/Facebook Developers**, **Supabase / Neon** và **Vercel Environment Variables**.
2. Kiểm tra lại trạng thái Git bằng `git ls-files` và làm sạch lịch sử Git nếu cần trước khi deploy lại trên Vercel.

---

## 2. Kiến Trúc Bảo Mật Ứng Dụng Windows Desktop (`desktop/`)

Ứng dụng Electron Desktop tuân thủ nghiêm ngặt các tiêu chuẩn bảo mật của Electron:
- **`contextIsolation: true`**, **`nodeIntegration: false`**, **`sandbox: true`**, **`webSecurity: true`**, **`allowRunningInsecureContent: false`**.
- **Cầu nối Preload tối giản (`desktop/preload.js`)**: Chỉ expose các hàm an toàn (`setPlayingState`, `openOAuth`) qua `contextBridge`, tuyệt đối không mở trực tiếp `ipcRenderer` hay quyền truy cập hệ thống tệp (`fs`, `child_process`) cho giao diện web.
- **Chặn Popup & Điều Hướng Ngoài Vùng (`setWindowOpenHandler`, `will-navigate`)**: Mọi cửa sổ popup bị từ chối; các liên kết ngoài origin chính thức (`https://hnbeemusic.vercel.app`) được mở bằng trình duyệt mặc định của hệ điều hành.
- **Đăng nhập OAuth qua Trình Duyệt Hệ Thống + Deep Link (`hnbeemusic://`)**:
  - Đăng nhập Google/Facebook mở trực tiếp trên trình duyệt gốc của Windows (tránh WebView không an toàn và tuân thủ chính sách OAuth của Google).
  - Sau khi xác thực thành công, máy chủ cấp mã chuyển tiếp có chữ ký ngắn hạn (**120 giây**, phạm vi `purpose: "desktop-handoff"`) truyền về qua giao thức `hnbeemusic://auth-callback`, sau đó đổi sang HttpOnly Cookie bên trong cửa sổ Electron qua `/api/auth/desktop-exchange`.

---

## 3. Báo Cáo Lỗ Hổng Bảo Mật

Nếu bạn phát hiện bất kỳ lỗ hổng bảo mật nào trong HnBee Music (Web hoặc Desktop):
- **Không** mở Public Issue công khai chi tiết khai thác.
- Hãy sử dụng tính năng **GitHub Security Advisories (Private Vulnerability Reporting)** tại kho lưu trữ `HnguynbeeIT/HnBeeMusic` hoặc liên hệ trực tiếp quản trị viên dự án để xử lý và phát hành bản vá khẩn cấp.
