"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cloud,
  Headphones,
  History,
  Monitor,
  Music2,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { BrandLogo } from "@/components/BrandLogo";

const EXPERIENCES = [
  {
    icon: Music2,
    accent: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20",
    title: "Hợp nhất mọi giai điệu",
    description:
      "Thoải mái tìm kiếm bài hát, dán link playlist yêu thích từ bất kỳ nền tảng nào và lưu giữ tất cả trong một thư viện cá nhân duy nhất.",
  },
  {
    icon: Headphones,
    accent: "bg-sky-500/15 text-sky-400 ring-sky-400/20",
    title: "Nghe nhạc trọn vẹn mọi khoảnh khắc",
    description:
      "Chế độ nghe nhạc nền mượt mà ngay cả khi tắt màn hình điện thoại, giúp âm nhạc đồng hành trên mọi chuyến đi hay lúc làm việc.",
  },
  {
    icon: Cloud,
    accent: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
    title: "Lưu giữ cảm xúc trên mọi thiết bị",
    description:
      "Chỉ cần đăng nhập bằng Google hoặc Facebook, toàn bộ playlist và những bản nhạc bạn thả tim sẽ luôn theo chân bạn từ máy tính sang điện thoại.",
  },
];

const WHATS_NEW = [
  {
    version: "v2.5.1",
    badge: "Mới nhất",
    highlights: [
      "Nâng cấp ứng dụng Windows Desktop với thanh tiêu đề liền mạch, điều khiển nhanh ngay trên thanh Taskbar Windows và tự động nhớ kích thước cửa sổ.",
      "Tăng cường bảo mật đăng nhập Google / Facebook trên máy tính qua trình duyệt gốc và tối ưu tốc độ khởi động ứng dụng.",
    ],
  },
  {
    version: "v2.5.0",
    badge: "Giao diện",
    highlights: [
      "Tái thiết kế Trang chủ Dark Glassmorphism với Quick Access, Spotlight Hero và dải khám phá ngang.",
      "Ra mắt bản ứng dụng Desktop Windows (.exe) chạy nền dưới System Tray & điều khiển bằng phím Media.",
      "Tối ưu màn hình dọc điện thoại và sửa triệt để thao tác đóng / vuốt xuống màn hình Lời bài hát trên iPhone.",
    ],
  },
  {
    version: "v2.4.0",
    badge: "Âm thanh",
    highlights: [
      "Nâng cấp độ chính xác khớp bài hát cho Playlist Spotify và tối ưu tốc độ tải xuống dưới 1.5 giây.",
      "Hỗ trợ nghe nền mượt hơn trên iOS với luồng âm thanh trực tiếp và tự chuyển bài khi khóa màn hình.",
    ],
  },
];

export function AboutModal() {
  const isOpen = useSettingsStore((s) => s.isAboutOpen);
  const setAboutOpen = useSettingsStore((s) => s.setAboutOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setAboutOpen(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={SPRING_PHYSICS}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-hnbee-title"
            className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl shadow-black/80 backdrop-blur-2xl"
          >
            {/* Subtle Ambient Top Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[80px]"
            />

            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <BrandLogo variant="compact" />
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  v2.5.0
                </span>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => setAboutOpen(false)}
                aria-label="Đóng cửa sổ giới thiệu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            {/* Scrollable Body */}
            <div className="relative space-y-6 overflow-y-auto px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* Part 1: Brand Story & Mission */}
              <section className="space-y-3">
                <h2
                  id="about-hnbee-title"
                  className="bg-gradient-to-br from-white via-zinc-100 to-emerald-300 bg-clip-text text-xl font-bold leading-snug tracking-tight text-transparent sm:text-2xl"
                >
                  HnBee Music — Không gian âm nhạc không ranh giới.
                </h2>
                <p className="text-sm leading-relaxed text-zinc-300">
                  Nơi mọi giai điệu yêu thích của bạn từ{" "}
                  <span className="font-medium text-emerald-400">Spotify</span>,{" "}
                  <span className="font-medium text-rose-400">YouTube</span> và{" "}
                  <span className="font-medium text-orange-400">SoundCloud</span>{" "}
                  hội tụ về một không gian nghe nhạc liền mạch, tinh gọn, không
                  bị gián đoạn bởi quảng cáo và luôn đồng hành cùng bạn mọi lúc
                  mọi nơi.
                </p>
              </section>

              {/* Part 2: 3 Listener-First Experiences */}
              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Trải nghiệm dành riêng cho bạn
                </p>
                <div className="space-y-2.5">
                  {EXPERIENCES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${item.accent}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <h3 className="text-sm font-semibold text-white">
                            {item.title}
                          </h3>
                          <p className="text-xs leading-relaxed text-zinc-400">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Part 3: What's New (Lịch sử cập nhật) */}
              <section className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Lịch sử cập nhật (What&apos;s New)
                  </p>
                </div>
                <div className="space-y-2.5">
                  {WHATS_NEW.map((rel) => (
                    <div
                      key={rel.version}
                      className="space-y-1.5 rounded-2xl border border-white/10 bg-black/30 p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">
                          {rel.version}
                        </span>
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          {rel.badge}
                        </span>
                      </div>
                      <ul className="space-y-1 text-xs leading-relaxed text-zinc-400">
                        {rel.highlights.map((line) => (
                          <li key={line} className="flex items-start gap-1.5">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              {/* Part 4: Desktop (.exe) & Mobile App Shortcut */}
              <section className="space-y-2.5">
                <Link
                  href="/download"
                  onClick={() => setAboutOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 transition-colors hover:bg-emerald-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        Tải bản PC cho Windows (.exe)
                      </p>
                      <p className="text-[11px] text-emerald-200/80">
                        Chạy nền dưới khay hệ thống &amp; phím tắt bàn phím
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-emerald-300">
                    Mở →
                  </span>
                </Link>

                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-zinc-200">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-300">
                    <strong className="font-semibold text-white">
                      Mẹo nhỏ:
                    </strong>{" "}
                    Chọn{" "}
                    <strong className="text-emerald-300">
                      &lsquo;Thêm vào Màn hình chính&rsquo;
                    </strong>{" "}
                    trên trình duyệt điện thoại để mở HnBee Music toàn màn hình
                    như ứng dụng gốc.
                  </p>
                </div>
              </section>

              {/* Subtle Brand Footer */}
              <footer className="space-y-1 border-t border-white/10 pt-4 text-center">
                <p className="text-xs text-zinc-300">
                  Phát triển bởi{" "}
                  <span className="font-semibold text-white">
                    HNT - HnBee Technologies
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400">
                  A division of{" "}
                  <span className="font-medium text-zinc-200">
                    Hyper Next Generation (HNG)
                  </span>{" "}
                  &bull; Dành tặng cộng đồng yêu âm nhạc.
                </p>
              </footer>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
