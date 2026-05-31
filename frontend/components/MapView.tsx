"use client";
/**
 * MapView — Peta Leaflet interaktif
 * - Circle layers are non-interactive (clicks pass through)
 * - Click anywhere → triggers route optimization
 * - Route from user to shelters
 * - Crosshair cursor
 */

import { useEffect, useState, useRef } from "react";
import {
  MapContainer, TileLayer, Marker, Polyline,
  Circle, Popup, useMapEvents,
} from "react-leaflet";
import L from "leaflet";

/* ── Tipe data ─────────────────────────────────────────────────── */
export interface ShelterRoute {
  shelter_id: string; nama: string;
  lat: number; lon: number;
  jumlah_grup: number; bobot_rute: number;
  jarak_meter: number; kapasitas_max: number;
  sisa_kapasitas: number;
  status_kapasitas: string; status_ml: string;
  risk_segments: Record<string, number>;
  path: number[][];
  alasan_rekomendasi?: string;
}

export interface RekomendasiUtama {
  shelter_id: string;
  nama: string;
  jarak_meter: number;
  status_ml: string;
  alasan: string;
}

export interface OptimizeResult {
  user_lat: number; user_lon: number;
  user_node_lat: number; user_node_lon: number;
  nama_zona: string; kepadatan: string;
  total_shelter_zona: number; fitness_terbaik: number;
  routes: ShelterRoute[];
  rekomendasi_utama: RekomendasiUtama | null;
  riwayat_fitness: number[];
  waktu_komputasi: number;
}

interface Shelter {
  id: string; nama: string;
  lat: number; lon: number;
  kluster_zona_id: number;
  kategori_zona: string;
  status_kapasitas_ml: string;
}

interface ClusterInfo {
  name: string; center: number[]; shelter_count: number;
  bounds?: { min_lat: number; max_lat: number; min_lon: number; max_lon: number };
}
interface ClusterData {
  layer1_zona: Record<string, ClusterInfo>;
  layer3_kepadatan: Record<string, { name: string; center: number[]; ga_params: Record<string, number> }>;
}

/* ── Konstanta warna (solid, formal) ────────────────────────────── */
const L1_COLOR = ["#2563eb", "#7c3aed", "#059669"];
const L3_COLOR = ["#d97706", "#dc2626", "#0891b2", "#db2777"];
const PADANG: [number, number] = [-0.945, 100.375];

/* ── Batas wilayah Kota Padang (daratan) ────────────────────────── */
const PADANG_BOUNDS = {
  min_lat: -1.07, max_lat: -0.82,
  min_lon: 100.33, max_lon: 100.42,
};

/** Hitung radius lingkaran dari bounding box shelter, dg batas min/max */
function radiusFromBounds(bounds?: ClusterInfo["bounds"], fallback = 2000) {
  if (!bounds) return fallback;
  const dLat = Math.abs(bounds.max_lat - bounds.min_lat);
  const dLon = Math.abs(bounds.max_lon - bounds.min_lon);
  // Konversi derajat ke meter (approx)
  const mLat = dLat * 111_320;
  const mLon = dLon * 111_320 * Math.cos(((bounds.min_lat + bounds.max_lat) / 2) * Math.PI / 180);
  const r = Math.max(mLat, mLon) / 2;
  return Math.max(800, Math.min(r, 5000)); // clamp 800m–5000m
}

/** Pastikan center tidak di laut: clamp ke batas daratan */
function clampCenter(center: [number, number]): [number, number] {
  return [
    Math.max(PADANG_BOUNDS.min_lat, Math.min(PADANG_BOUNDS.max_lat, center[0])),
    Math.max(PADANG_BOUNDS.min_lon, Math.min(PADANG_BOUNDS.max_lon, center[1])),
  ];
}

/* ── Minimalist Shelter Icon: Simple Dot ────────────────────────── */
function mkSimpleDotIcon(color: string, radius = 6, glow = false) {
  const size = radius * 3;
  const glowFilter = glow
    ? `<defs><filter id="sg${color.slice(1)}" x="-50%" y="-50%" width="200%" height="200%">
         <feGaussianBlur stdDeviation="${radius * 0.8}" result="blur"/>
         <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
       </filter></defs>`
    : "";
  const filterAttr = glow ? ` filter="url(#sg${color.slice(1)})"` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"${filterAttr}>
    ${glowFilter}
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${color}" stroke="white" stroke-width="1.5"/>
  </svg>`;

  return L.divIcon({
    html: svg, className: "shelter-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -radius],
  });
}

/* ── User click marker ─────────────────────────────────────────── */
const ICO_USER = (() => {
  const size = 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="10" fill="#2563eb" stroke="white" stroke-width="3"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="24" fill="#2563eb" fill-opacity="0.2" class="user-pulse-ring"/>
  </svg>`;
  return L.divIcon({
    html: svg, className: "user-target-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -15],
  });
})();

/* ── Shelter icons by status ───────────────────────────────────── */
const ICO_LEGA = mkSimpleDotIcon("#059669", 6);
const ICO_SEDANG = mkSimpleDotIcon("#d97706", 6);
const ICO_PENUH = mkSimpleDotIcon("#dc2626", 6);
const ICO_DEFAULT = mkSimpleDotIcon("#6b7280", 4);

const ICO_REC_LEGA = mkSimpleDotIcon("#059669", 9, true);
const ICO_REC_SEDANG = mkSimpleDotIcon("#d97706", 9, true);
const ICO_REC_PENUH = mkSimpleDotIcon("#dc2626", 9, true);

function shelterIcon(status: string) {
  if (status === "LEGA") return ICO_LEGA;
  if (status === "CUKUP") return ICO_SEDANG;
  if (status === "RAWAN PENUH") return ICO_PENUH;
  return ICO_DEFAULT;
}

function recShelterIcon(status: string) {
  if (status === "LEGA") return ICO_REC_LEGA;
  if (status === "CUKUP") return ICO_REC_SEDANG;
  if (status === "RAWAN PENUH") return ICO_REC_PENUH;
  return ICO_REC_LEGA;
}

/* ── Route colors (solid, formal) ──────────────────────────────── */
const ROUTE_COLORS = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#dc2626", "#0891b2"];

/* ── Klik handler ──────────────────────────────────────────────── */
function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/* ── Komponen utama ─────────────────────────────────────────────── */
export default function MapView({
  result, onMapClick, userCoord, layers, loading,
}: {
  result: OptimizeResult | null;
  onMapClick: (lat: number, lon: number) => void;
  userCoord: [number, number] | null;
  layers: { l1: boolean; l3: boolean; shelters: boolean; routes: boolean };
  loading: boolean;
}) {
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [clusters, setClusters] = useState<ClusterData | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    fetch("/api/shelters").then(r => r.json()).then(d => d.shelters && setShelters(d.shelters)).catch(() => {});
    fetch("/api/clusters").then(r => r.json()).then(d => setClusters(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (result && mapRef.current) {
      const points: [number, number][] = [[result.user_lat, result.user_lon]];
      result.routes.forEach(r => points.push([r.lat, r.lon]));
      if (points.length > 1) {
        const bounds = L.latLngBounds(points);
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 1.4 });
      } else {
        mapRef.current.flyTo([result.user_lat, result.user_lon], 15, { duration: 1.4 });
      }
    }
  }, [result]);

  function handleGPS() {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        onMapClick(pos.coords.latitude, pos.coords.longitude);
      }, () => {
        alert("Gagal mendapatkan lokasi GPS. Pastikan izin lokasi diberikan.");
      });
    } else {
      alert("Browser Anda tidak mendukung GPS.");
    }
  }

  const recIds = new Set(result?.routes.map(r => r.shelter_id) ?? []);

  return (
    <div className="map-wrap">
      <MapContainer
        center={PADANG} zoom={13}
        style={{ height: "100%", width: "100%", cursor: "crosshair" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickHandler onClick={onMapClick} />

        {/* Layer 1: Zona Shelter — radius dinamis dari bounding box */}
        {layers.l1 && clusters?.layer1_zona &&
          Object.entries(clusters.layer1_zona).map(([cid, info]) => {
            const clamped = clampCenter([info.center[0], info.center[1]]);
            const r = radiusFromBounds(info.bounds, 2500);
            return (
              <Circle key={`l1-${cid}`}
                center={clamped}
                radius={r}
                interactive={false}
                pathOptions={{
                  color: L1_COLOR[Number(cid)] || "#6b7280",
                  fillColor: L1_COLOR[Number(cid)] || "#6b7280",
                  fillOpacity: 0.06, weight: 1.5, dashArray: "8 5",
                }}
              />
            );
          })}

        {/* Layer 3: Kepadatan Area — radius lebih kecil, center di-clamp */}
        {layers.l3 && clusters?.layer3_kepadatan &&
          Object.entries(clusters.layer3_kepadatan).map(([cid, info]) => {
            const clamped = clampCenter([info.center[0], info.center[1]]);
            return (
              <Circle key={`l3-${cid}`}
                center={clamped}
                radius={3500}
                interactive={false}
                pathOptions={{
                  color: L3_COLOR[Number(cid)] || "#6b7280",
                  fillColor: L3_COLOR[Number(cid)] || "#6b7280",
                  fillOpacity: 0.04, weight: 1.2, dashArray: "4 8",
                }}
              />
            );
          })}

        {/* Semua shelter */}
        {layers.shelters && shelters
          .filter(s => !recIds.has(s.id))
          .map(s => (
            <Marker key={s.id} position={[s.lat, s.lon]}
              icon={shelterIcon(s.status_kapasitas_ml)}
            >
              <Popup>
                <strong>{s.nama}</strong><br />
                <em>{s.kategori_zona}</em><br />
                Kapasitas: {s.status_kapasitas_ml}
              </Popup>
            </Marker>
          ))}

        {/* User click marker */}
        {userCoord && (
          <Marker position={userCoord} icon={ICO_USER}>
            <Popup>
              <strong>Posisi Anda</strong><br />
              {userCoord[0].toFixed(6)}, {userCoord[1].toFixed(6)}
            </Popup>
          </Marker>
        )}

        {/* Routes + recommended shelter icons */}
        {layers.routes && result?.routes.map((route, i) => {
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
          const exactVisualPath = [
            [result.user_lat, result.user_lon],
            ...route.path,
            [route.lat, route.lon]
          ] as [number, number][];

          return (
            <span key={route.shelter_id}>
              {/* Route outline */}
              {exactVisualPath.length > 1 && (
                <Polyline
                  positions={exactVisualPath}
                  interactive={false}
                  pathOptions={{
                    color: color, weight: 8, opacity: 0.12,
                    lineCap: "round", lineJoin: "round",
                  }}
                />
              )}
              {/* Route main line */}
              {exactVisualPath.length > 1 && (
                <Polyline
                  positions={exactVisualPath}
                  interactive={false}
                  pathOptions={{
                    color: color, weight: 3, opacity: 0.85,
                    lineCap: "round", lineJoin: "round",
                  }}
                />
              )}
              {/* Recommended shelter */}
              <Marker position={[route.lat, route.lon]}
                icon={recShelterIcon(route.status_ml)}
              >
                <Popup>
                  <strong>#{i + 1} {route.nama}</strong><br />
                  Jarak: {(route.jarak_meter / 1000).toFixed(2)} km<br />
                  Sisa kapasitas: {route.sisa_kapasitas.toLocaleString("id-ID")}<br />
                  Status: {route.status_ml}
                </Popup>
              </Marker>
            </span>
          );
        })}
      </MapContainer>

      {/* Hint */}
      {!userCoord && !loading && (
        <div className="click-hint">Klik pada peta untuk memilih lokasi</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="map-loading">
          <div className="map-loading-spinner" />
          <span>Menghitung rute optimal...</span>
        </div>
      )}

      {/* GPS Button */}
      <button className="gps-btn" onClick={handleGPS} title="Gunakan lokasi saya">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  );
}
