"use client";

interface BrandCreditProps {
  className?: string;
}

export function BrandCredit({ className = "" }: BrandCreditProps) {
  return (
    <div
      className={`space-y-0.5 text-[10px] leading-relaxed text-[#A8B2C1]/80 ${className}`}
    >
      <p className="font-display font-semibold text-[#F4F6FA]/90">
        Powered by{" "}
        <span className="text-[#00E5FF]">HNT</span>{" "}
        <span className="text-[#A8B2C1]/60">&amp;</span>{" "}
        <span className="text-[#8B5CF6]">HNM</span>
      </p>
      <p className="text-[9.5px] text-[#A8B2C1]/70">
        HNG &mdash; Hyper Next Generation Group
      </p>
      <p className="text-[9.5px]">
        <a
          href="https://music.hng.vn"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#A8B2C1]/80 underline-offset-2 transition-colors hover:text-[#00E5FF] hover:underline"
        >
          music.hng.vn
        </a>{" "}
        <span className="mx-0.5 text-[#A8B2C1]/40">&bull;</span>{" "}
        <a
          href="https://github.com/HnguynbeeIT"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#A8B2C1]/80 underline-offset-2 transition-colors hover:text-[#F4F6FA] hover:underline"
        >
          HnguynbeeIT
        </a>
      </p>
    </div>
  );
}
