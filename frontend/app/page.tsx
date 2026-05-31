"use client";
/**
 * Halaman Utama — Sistem Evakuasi Bencana Kota Padang
 *
 * Alur:
 *  1. User klik titik di peta
 *  2. POST /api/optimize → FastAPI → GA + 4-Layer K-Means
 *  3. Tampilkan rute optimal + cluster layers di peta
 *  4. Panel sidebar menampilkan detail + grafik konvergensi
 */

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import type { OptimizeResult } from "@/components/MapView";

import LandingPage from "@/components/LandingPage";

// Lazy-load MapView (Leaflet butuh window object — tidak bisa SSR)
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [isLanding, setIsLanding] = useState(true);
  const [result,    setResult]    = useState<OptimizeResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [userCoord, setUserCoord] = useState<[number, number] | null>(null);

  // Layer visibility state — bisa di-toggle dari Sidebar
  const [layers, setLayers] = useState({
    l1: true,       // Layer 1: zona shelter
    l3: true,       // Layer 3: kepadatan area
    shelters: true, // semua marker shelter
    routes: true,   // rute optimal
  });

  // Handler: klik titik di peta → panggil API optimize
  const handleMapClick = useCallback(async (lat: number, lon: number) => {
    setUserCoord([lat, lon]);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}: Gagal menghubungi backend`);
      }

      const data: OptimizeResult = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan tidak dikenal");
    } finally {
      setLoading(false);
    }
  }, []);

  if (isLanding) {
    return <LandingPage onStart={() => setIsLanding(false)} />;
  }

  return (
    <main className="app-layout fade-in">
      {/* Peta interaktif */}
      <MapView
        result={result}
        onMapClick={handleMapClick}
        userCoord={userCoord}
        layers={layers}
        loading={loading}
      />
      {/* Panel sidebar */}
      <Sidebar
        result={result}
        loading={loading}
        error={error}
        layers={layers}
        setLayers={setLayers}
      />
    </main>
  );
}
