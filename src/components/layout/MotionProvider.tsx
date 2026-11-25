"use client";

import { LayoutGroup } from "framer-motion";
import { RegionProvider } from "@/context/RegionContext";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <RegionProvider>
      <LayoutGroup>{children}</LayoutGroup>
    </RegionProvider>
  );
}
