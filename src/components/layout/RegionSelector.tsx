"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { REGION_LIST, type RegionCode } from "@/lib/audio/region";
import { useRegion } from "@/context/RegionContext";
import { SPRING_PHYSICS } from "@/lib/ui/source-theme";

interface RegionSelectorProps {
  compact?: boolean;
}

export function RegionSelector({ compact = false }: RegionSelectorProps) {
  const { region, regionInfo, setRegion } = useRegion();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const handleSelect = (code: RegionCode) => {
    setRegion(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chọn khu vực âm nhạc"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-xl transition-colors hover:border-white/25 hover:bg-zinc-900 hover:text-white"
      >
        <span className="text-sm leading-none">{regionInfo.flag}</span>
        {!compact && <span>{regionInfo.shortLabel}</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={SPRING_PHYSICS}
            className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-2xl"
          >
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Ưu tiên Khu vực &amp; Thị trường
            </p>
            {REGION_LIST.map((item) => {
              const active = item.code === region;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelect(item.code)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                    active
                      ? "bg-white/15 font-semibold text-white"
                      : "text-zinc-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">{item.flag}</span>
                    <span>{item.label}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
