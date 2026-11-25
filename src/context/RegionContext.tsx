"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  REGIONS,
  parseRegionCode,
  type RegionCode,
  type RegionInfo,
} from "@/lib/audio/region";

const STORAGE_KEY = "hnbeemusic-region";

interface RegionContextValue {
  region: RegionCode;
  regionInfo: RegionInfo;
  setRegion: (code: RegionCode) => void;
}

const RegionContext = createContext<RegionContextValue>({
  region: "VN",
  regionInfo: REGIONS.VN,
  setRegion: () => {},
});

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegionState] = useState<RegionCode>("VN");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRegionState(parseRegionCode(saved));
      }
    } catch {}

    const handleCloudRegionSync = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        const parsed = parseRegionCode(detail);
        setRegionState(parsed);
        try {
          window.localStorage.setItem(STORAGE_KEY, parsed);
        } catch {}
      }
    };

    window.addEventListener("hnbee:region-sync", handleCloudRegionSync);
    return () => {
      window.removeEventListener("hnbee:region-sync", handleCloudRegionSync);
    };
  }, []);

  const setRegion = (code: RegionCode) => {
    setRegionState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {}
  };

  const value = useMemo<RegionContextValue>(
    () => ({
      region,
      regionInfo: REGIONS[region],
      setRegion,
    }),
    [region]
  );

  return (
    <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
  );
}

export function useRegion() {
  return useContext(RegionContext);
}
