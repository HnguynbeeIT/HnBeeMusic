"use client";

interface BrandCreditProps {
  className?: string;
}

export function BrandCredit({ className = "" }: BrandCreditProps) {
  return (
    <p
      className={`text-[11px] leading-relaxed text-zinc-500 ${className}`}
    >
      Credit by{" "}
      <span className="text-zinc-400">@_hnguynbee.hng_</span> /{" "}
      <a
        href="https://github.com/HnguynbeeIT"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline"
      >
        HnguynbeeIT
      </a>{" "}
      <span className="mx-0.5 text-zinc-600">&bull;</span>{" "}
      <a
        href="https://hanguynbeeit-portfolio.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline"
      >
        Portfolio
      </a>
    </p>
  );
}
