"use client";

interface BrandCreditProps {
  className?: string;
}

export function BrandCredit({ className = "" }: BrandCreditProps) {
  return (
    <div className={`space-y-0.5 text-[10px] leading-relaxed text-zinc-500 ${className}`}>
      <p className="font-medium text-zinc-400">
        HNT - HnBee Technologies
      </p>
      <p className="text-[9.5px] text-zinc-500">
        A division of{" "}
        <span className="text-zinc-400">Hyper Next Generation (HNG)</span>
      </p>
      <p>
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
    </div>
  );
}
