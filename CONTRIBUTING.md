# Contributing to HnBeeMusic

Cảm ơn bạn đã quan tâm đóng góp cho **HnBeeMusic**! Dự án theo đuổi triết lý mã nguồn sạch, dễ mở rộng và tối ưu 60fps.

## 1. Quy trình đóng góp nhanh
1. **Fork** repository và tạo nhánh mới từ `main`:
   ```bash
   git checkout -b feat/ten-tinh-nang
   ```
2. Cài đặt và chạy thử local:
   ```bash
   npm install
   npm run dev
   ```
3. Trước khi tạo Pull Request, hãy đảm bảo không có lỗi TypeScript hoặc Build:
   ```bash
   npm run typecheck
   npm run build
   ```
4. Mở Pull Request mô tả rõ thay đổi (kèm ảnh chụp màn hình hoặc video ngắn nếu thay đổi giao diện).

---

## 2. Hướng dẫn viết thêm `AudioAdapter` mới (VD: Zing MP3, NhacCuaTui, Apple Music)

Mọi nguồn nhạc trong HnBeeMusic đều được chuẩn hóa về một interface duy nhất: **`UnifiedTrack`** (`src/lib/audio/types.ts`).

### Bước 1: Mở rộng `TrackSource`
Trong `src/lib/audio/types.ts`, thêm tên nguồn mới vào union type:
```ts
export type TrackSource = "youtube" | "soundcloud" | "spotify" | "zingmp3";
```

### Bước 2: Tạo file adapter tại `src/lib/adapters/[source].ts`
Ví dụ `src/lib/adapters/zingmp3.ts`:
```ts
import type { UnifiedTrack } from "@/lib/audio/types";

export async function searchZingMp3(query: string): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];
  try {
    // 1. Gọi API phía server (không expose secret key ra client)
    // 2. Nâng cấp độ phân giải ảnh bìa nếu cần
    // 3. Chuẩn hóa kết quả về UnifiedTrack[]
    return [
      {
        id: "zing:example-id",
        title: "Tên bài hát",
        artist: "Tên nghệ sĩ",
        thumbnail: "https://...",
        duration: 210, // tính bằng giây
        source: "zingmp3",
        sourceUrl: "https://zingmp3.vn/...",
        streamUrl: "https://...", // nếu phát qua HTML5 Audio
      },
    ];
  } catch (error) {
    console.error("[zingmp3-adapter] search failed:", error);
    // BẮT BUỘC trả về [] khi lỗi để không làm gián đoạn các nguồn khác
    return [];
  }
}
```

### Bước 3: Đăng ký vào API Routes & Theme
1. **URL Parser** (`src/lib/audio/url-parser.ts`): Thêm Regex nhận diện link của nguồn mới.
2. **Search & Resolve API**: Gọi adapter mới song song trong `src/app/api/search/route.ts` và `src/app/api/resolve/route.ts`.
3. **Audio Engine** (`src/components/player/AudioEngineHost.tsx`): Điều hướng nguồn mới sang adapter phát tương ứng (đảm bảo gọi `stopAndReset()` trên engine cũ khi chuyển nguồn).
4. **Source Theme** (`src/lib/ui/source-theme.ts`): Thêm màu badge và màu thanh Seekbar riêng cho nguồn mới.

---

## 3. Quy tắc bắt buộc
- Không commit `.env.local` hay bất kỳ API Key nào.
- Không dùng `ytdl-core` ở phía client.
- Luôn bọc lời gọi API bên ngoài trong `try/catch` và trả về mảng rỗng `[]` khi thất bại.
- Chỉ animate các thuộc tính GPU-accelerated (`transform`, `opacity`, `clip-path`) với Framer Motion.
