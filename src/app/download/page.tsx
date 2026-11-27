"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Keyboard,
  Layers,
  Monitor,
  Share,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { BrandLogo } from "@/components/BrandLogo";

const WINDOWS_SETUP_URL =
  "https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest/download/HnBee-Music-Setup.exe";
const WINDOWS_PORTABLE_URL =
  "https://github.com/HnguynbeeIT/HnBeeMusic/releases/latest/download/HnBee-Music-Portable.exe";

const DESKTOP_BENEFITS = [
  {
    icon: Layers,
    accent: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/25",
    title: "Chạy ngầm dưới khay hệ thống (System Tray)",
    description:
      "Bấm dấu X sẽ tự thu gọn nhẹ nhàng xuống khay hệ thống góc phải Windows, giúp âm nhạc tiếp tục phát trọn vẹn khi bạn làm việc hay chơi game.",
  },
  {
    icon: Keyboard,
    accent: "bg-sky-500/15 text-sky-400 ring-sky-400/25",
    title: "Điều khiển bằng phím tắt vật lý trên bàn phím",
    description:
      "Tích hợp phím cứng Play/Pause, Bài kế tiếp và Bài trước đó toàn hệ thống — chuyển bài tức thì ngay cả khi đang mở ứng dụng khác.",
  },
  {
    icon: Cpu,
    accent: "bg-amber-500/15 text-amber-300 ring-amber-400/25",
    title: "Không tốn RAM trình duyệt & Khởi động 1 chạm",
    description:
      "Tách biệt hoàn toàn khỏi hàng chục tab Chrome/Edge, mở khóa Autoplay ngay từ lần chạm đầu tiên và truy cập tức thì từ màn hình Desktop.",
  },
];

export default function DownloadPage() {
  return (
    <div className="w-full min-w-0 space-y-7 overflow-x-hidden sm:space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Quay lại Trang chủ
      </Link>

      {/* HERO WINDOWS DESKTOP DOWNLOAD CARD */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/65 p-6 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-[110px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky-500/15 blur-[100px]"
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Phiên bản mới nhất v2.5.1
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] text-zinc-300">
                <Monitor className="h-3.5 w-3.5 text-sky-400" />
                Windows 10/11 64-bit &bull; 87.4 MB
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="bg-gradient-to-br from-white via-zinc-100 to-emerald-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-4xl">
                Tải HnBee Music cho Máy tính (.exe)
              </h1>
              <p className="text-sm leading-relaxed text-zinc-300">
                Trải nghiệm không gian nghe nhạc đa nguồn chuẩn Audiophile ngay
                trên Windows — tối giản, đồng bộ Cloud tự động với điện thoại và
                sẵn sàng chạy nền mượt mà suốt cả ngày.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <motion.a
                href={WINDOWS_SETUP_URL}
                target="_blank"
                rel="noreferrer"
                {...BUTTON_MOTION}
                className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-950 shadow-xl shadow-emerald-500/20 hover:bg-emerald-300"
              >
                <Download className="h-4 w-4" />
                <span>Tải xuống HnBee Music cho Windows (.exe)</span>
              </motion.a>

              <motion.a
                href={WINDOWS_PORTABLE_URL}
                target="_blank"
                rel="noreferrer"
                {...BUTTON_MOTION}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-xs font-semibold text-zinc-200 backdrop-blur-md hover:bg-white/15 hover:text-white"
              >
                <span>Tải bản Portable (Chạy ngay)</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </motion.a>
            </div>
          </div>

          {/* Sleek Desktop Preview Badge */}
          <div className="flex shrink-0 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/45 p-6 text-center shadow-inner backdrop-blur-xl lg:w-64">
            <BrandLogo variant="full" />
            <div className="mt-4 w-full space-y-1.5 border-t border-white/10 pt-4 text-left text-xs text-zinc-300">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>HnBee-Music-Setup.exe</span>
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>Phiên bản: v2.5.1 (x64)</span>
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>Dung lượng thực tế: 87.4 MB</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 ADVANTAGES OF DESKTOP .EXE */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">
            Vì sao nên dùng bản Desktop Windows (.exe)?
          </h2>
          <p className="text-xs text-zinc-400">
            Tối ưu riêng cho trải nghiệm nghe nhạc hàng ngày trên máy tính.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {DESKTOP_BENEFITS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 shadow-xl backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/80"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${item.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* WINDOWS SMARTSCREEN NOTE */}
      <section className="flex items-start gap-3.5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-5 backdrop-blur-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-sm font-semibold text-amber-200">
            Hướng dẫn mở file nếu Windows SmartScreen hiển thị cảnh báo
          </h3>
          <p className="text-xs leading-relaxed text-zinc-300">
            Vì HnBee Music là dự án cộng đồng chưa đăng ký chứng chỉ ký số thương
            mại của Microsoft, lần đầu mở{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-amber-200">
              HnBee-Music-Setup.exe
            </code>{" "}
            Windows có thể hiện khung xanh{" "}
            <strong className="text-white">Windows protected your PC</strong>.
            Bạn chỉ cần bấm{" "}
            <strong className="text-emerald-300">More info (Thông tin thêm)</strong>{" "}
            → chọn <strong className="text-emerald-300">Run anyway (Vẫn chạy)</strong>{" "}
            để cài đặt bình thường.
          </p>
        </div>
      </section>

      {/* MOBILE INSTALL GUIDE (iOS & ANDROID) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-emerald-400" />
          <h2 className="text-lg font-bold tracking-tight text-white">
            Cài đặt nhanh trên Điện thoại (iOS &amp; Android)
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* iPhone / iPad Safari */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                iPhone / iPad (iOS Safari)
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                PWA Native
              </span>
            </div>
            <ol className="space-y-2 text-xs leading-relaxed text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[10px] font-bold text-emerald-300">
                  1
                </span>
                <span>
                  Mở <strong className="text-white">hnbeemusic.vercel.app</strong>{" "}
                  bằng trình duyệt <strong className="text-white">Safari</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[10px] font-bold text-emerald-300">
                  2
                </span>
                <span>
                  Chạm biểu tượng{" "}
                  <strong className="inline-flex items-center gap-1 text-white">
                    <Share className="inline h-3 w-3 text-sky-400" /> Chia sẻ
                  </strong>{" "}
                  ở thanh dưới cùng.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[10px] font-bold text-emerald-300">
                  3
                </span>
                <span>
                  Chọn{" "}
                  <strong className="text-emerald-300">
                    Thêm vào Màn hình chính (Add to Home Screen)
                  </strong>{" "}
                  → bấm <strong className="text-white">Thêm</strong>.
                </span>
              </li>
            </ol>
          </div>

          {/* Android Chrome */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Android (Chrome / Edge)
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                1-Tap Install
              </span>
            </div>
            <ol className="space-y-2 text-xs leading-relaxed text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-[10px] font-bold text-sky-300">
                  1
                </span>
                <span>
                  Truy cập{" "}
                  <strong className="text-white">hnbeemusic.vercel.app</strong>{" "}
                  bằng <strong className="text-white">Google Chrome</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-[10px] font-bold text-sky-300">
                  2
                </span>
                <span>
                  Bấm biểu tượng <strong className="text-white">⋮</strong> (Menu)
                  ở góc trên bên phải.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-[10px] font-bold text-sky-300">
                  3
                </span>
                <span>
                  Chọn{" "}
                  <strong className="text-sky-300">
                    Cài đặt ứng dụng (Install app)
                  </strong>{" "}
                  để đưa HnBee Music ra màn hình chính.
                </span>
              </li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
