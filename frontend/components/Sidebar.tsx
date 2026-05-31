"use client";
/**
 * Sidebar — Panel informasi dan hasil optimasi
 */

import { useState, Dispatch, SetStateAction } from "react";
import type { OptimizeResult } from "./MapView";
import ConvergenceChart from "./ConvergenceChart";

/* ── Helper ─────────────────────────────────────────────────────── */
function fmt(n: number) {
  if (n >= 1e15) return "~";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function statusBadge(s: string) {
  const clsMap: Record<string, string> = {
    "LEGA": "lega",
    "CUKUP": "cukup",
    "RAWAN PENUH": "rawan-penuh",
    "AMAN": "aman",
    "OVERLOAD": "overload",
  };
  const cls = clsMap[s] || s.toLowerCase().replace(/\s+/g, "-");
  return <span className={`badge ${cls}`}>{s}</span>;
}

/* ── Komponen utama ─────────────────────────────────────────────── */
export default function Sidebar({
  result, loading, error,
  layers, setLayers,
  jumlahOrang, setJumlahOrang,
}: {
  result: OptimizeResult | null;
  loading: boolean;
  error: string | null;
  layers: { l1: boolean; l3: boolean; shelters: boolean; routes: boolean };
  setLayers: Dispatch<SetStateAction<{ l1: boolean; l3: boolean; shelters: boolean; routes: boolean }>>;
  jumlahOrang: number;
  setJumlahOrang: Dispatch<SetStateAction<number>>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  function toggle(key: keyof typeof layers) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className={`sidebar ${isExpanded ? "expanded" : ""}`}>
      {/* Tombol Expand */}
      <button 
        type="button"
        className="expand-btn" 
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Perkecil Panel" : "Perbesar Panel & Baca Panduan"}
      >
        {isExpanded ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        )}
      </button>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="sb-header">
        <div className="sb-logo">
          <div>
            <div className="sb-title">Evakuasi Bencana</div>
            <div className="sb-subtitle">Kota Padang</div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="sb-body">
        {/* ── Input Kerumunan ─────────────────────────────────── */}
        <div className="sec-title">Estimasi Jumlah Rombongan (Orang)</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
          <input 
            type="number" 
            min="1"
            value={jumlahOrang} 
            onChange={(e) => setJumlahOrang(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ 
              width: "100%", padding: "8px 12px", 
              borderRadius: "6px", border: "1px solid var(--border)",
              backgroundColor: "var(--bg-card)", color: "var(--text-main)",
              outline: "none", fontSize: "14px", fontFamily: "inherit"
            }}
          />
        </div>
        {/* Panduan ML (Muncul saat diperbesar atau jika diinginkan) */}
        {isExpanded && (
          <div className="tutorial-section">
            <div className="sec-title">Panduan & Penjelasan Algoritma</div>
            <div className="tutorial-content">
              <p>Aplikasi ini memadukan dua kecerdasan buatan utama:</p>
              
              <h4>1. K-Means Clustering (4-Layer)</h4>
              <ul>
                <li><strong>L1 (Zona Shelter)</strong>: Mengelompokkan 147 shelter di Padang ke dalam 3 zona geografis (Pusat Kota, Sub-Urban, Pesisir).</li>
                <li><strong>L2 (Risiko Jalan)</strong>: Menganalisis 100 ribu lebih ruas jalan. Jalan kecil atau dekat pantai diberi "penalti" agar dihindari.</li>
                <li><strong>L3 (Kepadatan Area)</strong>: Menentukan titik mana yang sepi hingga sangat padat, untuk menyesuaikan populasi Algoritma Genetika.</li>
                <li><strong>L4 (Kapasitas Shelter)</strong>: Menghitung rasio populasi di sekitar shelter berbanding kapasitas aslinya, mendeteksi mana yang <em>Rawan Penuh</em> (Merah), <em>Cukup</em> (Kuning), atau <em>Lega</em> (Hijau).</li>
              </ul>

              <h4>2. Algoritma Genetika (GA)</h4>
              <p>
                Mencari rute evakuasi tercepat dan paling aman. Tidak seperti Google Maps yang hanya mencari jarak terpendek, algoritma ini menyeleksi rute yang menghindari jalan berisiko tinggi dan memprioritaskan shelter yang masih lengang.
              </p>
            </div>
          </div>
        )}

        {/* Layer toggle panel */}
        <div className="sec-title">Layer Peta</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          <label className="layer-toggle">
            <input type="checkbox" checked={layers.l1} onChange={() => toggle("l1")}/>
            <span className="leg-line" style={{ background: "#2563eb" }}/>
            Zona Shelter
          </label>
          <label className="layer-toggle">
            <input type="checkbox" checked={layers.l3} onChange={() => toggle("l3")}/>
            <span className="leg-line" style={{ background: "#d97706" }}/>
            Kepadatan Area
          </label>
          <label className="layer-toggle">
            <input type="checkbox" checked={layers.shelters} onChange={() => toggle("shelters")}/>
            <span className="leg-dot" style={{ background: "#10b981" }}/>
            Semua Shelter
          </label>
          <label className="layer-toggle">
            <input type="checkbox" checked={layers.routes} onChange={() => toggle("routes")}/>
            <span className="leg-line" style={{ background: "#3b82f6" }}/>
            Rute Optimal
          </label>
        </div>

        {/* ── Idle ──────────────────────────────────────────── */}
        {!result && !loading && !error && (
          <div className="idle-card">
            <div className="idle-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
              </svg>
            </div>
            <h2>Pilih Titik di Peta</h2>
            <p>Klik lokasi Anda di peta untuk menghitung rute evakuasi bencana optimal.</p>
            <div className="idle-steps">
              <div className="idle-step">
                <div className="idle-step-num">1</div>
                <span>Klik sembarang titik di peta</span>
              </div>
              <div className="idle-step">
                <div className="idle-step-num">2</div>
                <span>Sistem menganalisis zona dan risiko</span>
              </div>
              <div className="idle-step">
                <div className="idle-step-num">3</div>
                <span>GA menemukan rute terbaik</span>
              </div>
              <div className="idle-step">
                <div className="idle-step-num">4</div>
                <span>Arah menuju shelter ditampilkan</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div className="loading-card">
            <div className="spinner-ring"/>
            <h3>Mengoptimasi Rute</h3>
            <p>Mencari jalur evakuasi paling optimal</p>
            <div className="loading-stages">
              <div className="loading-stage"><div className="stage-dot"/>Klasifikasi zona shelter</div>
              <div className="loading-stage"><div className="stage-dot"/>Analisis risiko jalan</div>
              <div className="loading-stage"><div className="stage-dot"/>Penyesuaian parameter GA</div>
              <div className="loading-stage"><div className="stage-dot"/>Filter kapasitas dan evolusi</div>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {error && !loading && (
          <div className="error-card">
            <p>{error}</p>
          </div>
        )}

        {/* ── Hasil ─────────────────────────────────────────── */}
        {result && !loading && (
          <div className="result-wrap">

            {/* Koordinat pengguna */}
            <div className="user-coord-bar">
              <div className="user-coord-dot"/>
              <div className="user-coord-text">
                <span className="user-coord-label">Lokasi Anda</span>
                <span className="user-coord-val">
                  {result.user_lat.toFixed(5)}, {result.user_lon.toFixed(5)}
                </span>
              </div>
            </div>

            {/* Banner zona */}
            <div className="zona-banner">
              <div className="zona-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: "white" }}>
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                  <line x1="9" y1="3" x2="9" y2="18"/>
                  <line x1="15" y1="6" x2="15" y2="21"/>
                </svg>
              </div>
              <div className="zona-info">
                <div className="zona-label">Zona Pengguna</div>
                <div className="zona-name">
                  {result.nama_zona.replace(/^Zona \d+ \(/, "").replace(/\)$/, "")}
                </div>
                <div className="zona-density">
                  Kepadatan: <strong>{result.kepadatan}</strong>
                  &nbsp;/&nbsp;{result.total_shelter_zona} shelter tersedia
                </div>
              </div>
            </div>

            {/* Grid statistik */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Fitness Terbaik</div>
                <div className="stat-value c-blue">{fmt(result.fitness_terbaik)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Waktu Hitung</div>
                <div className="stat-value c-green">{result.waktu_komputasi.toFixed(2)}s</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Shelter Dipilih</div>
                <div className="stat-value c-cyan">{result.routes.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total di Zona</div>
                <div className="stat-value c-purple">{result.total_shelter_zona}</div>
              </div>
            </div>

            {/* ── Rekomendasi Utama Banner ──────────────────────── */}
            {result.rekomendasi_utama && (
              <div className="rekom-banner">
                <div className="rekom-banner-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div className="rekom-banner-content">
                  <div className="rekom-banner-title">Rekomendasi Utama</div>
                  <div className="rekom-banner-shelter">{result.rekomendasi_utama.nama}</div>
                  <div className="rekom-banner-reason">{result.rekomendasi_utama.alasan}</div>
                </div>
              </div>
            )}

            {/* Daftar shelter rekomendasi — detail card */}
            <div className="sec-title">
              Rute Evakuasi ({result.routes.length})
            </div>
            <div className="shelter-list">
              {result.routes.map((s, i) => {
                const isTopRec = result.rekomendasi_utama?.shelter_id === s.shelter_id;
                const isRawan = s.status_ml === "RAWAN PENUH";

                return (
                  <div
                    key={s.shelter_id}
                    className={`shelter-card rank-${i < 3 ? i+1 : "other"}${isTopRec ? " top-rec" : ""}${isRawan ? " rawan-card" : ""}`}
                    style={{ animationDelay: `${i * 0.07}s` }}
                  >
                    <div className="sc-header">
                      <span className="sc-name">
                        {isTopRec && <span className="sc-rec-badge">★ REKOMENDASI</span>}
                        {s.nama}
                      </span>
                      <span className="sc-rank">#{i + 1}</span>
                    </div>

                    {/* Alasan rekomendasi */}
                    {s.alasan_rekomendasi && (
                      <div className={`sc-alasan ${isRawan ? "sc-alasan-warn" : "sc-alasan-safe"}`}>
                        {s.alasan_rekomendasi}
                      </div>
                    )}

                    {/* Direction info */}
                    <div className="sc-direction">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sc-dir-icon">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 8 12 12 14 14"/>
                      </svg>
                      <span className="sc-dir-dist">
                        {(s.jarak_meter / 1000).toFixed(2)} km
                      </span>
                      <span className="sc-dir-sep">/</span>
                      <span className="sc-dir-time">
                        ~{Math.ceil((s.jarak_meter / 1000) / 4 * 60)} menit jalan kaki
                      </span>
                    </div>

                    <div className="sc-detail-grid">
                      <div className="sc-detail">
                        <span className="sc-detail-label">Kapasitas</span>
                        <span className="sc-detail-val">{s.kapasitas_max.toLocaleString("id-ID")}</span>
                      </div>
                      <div className="sc-detail">
                        <span className="sc-detail-label">Sisa</span>
                        <span className="sc-detail-val" style={{
                          color: s.sisa_kapasitas > 0 ? "var(--green)" : "var(--red)"
                        }}>
                          {s.sisa_kapasitas.toLocaleString("id-ID")}
                        </span>
                      </div>
                      <div className="sc-detail">
                        <span className="sc-detail-label">Status</span>
                        <span className="sc-detail-val">{statusBadge(s.status_ml)}</span>
                      </div>
                      <div className="sc-detail">
                        <span className="sc-detail-label">Orang</span>
                        <span className="sc-detail-val">{s.jumlah_orang}</span>
                      </div>
                      <div className="sc-detail">
                        <span className="sc-detail-label">Bobot</span>
                        <span className="sc-detail-val" style={{ fontSize: 10 }}>
                          {s.bobot_rute >= 1e15 ? "~" : s.bobot_rute.toFixed(0)}
                        </span>
                      </div>
                    </div>

                    {/* Risk segments */}
                    <div className="sc-risk">
                      {Object.entries(s.risk_segments).map(([k, v]) => (
                        v > 0 && (
                          <span key={k} className={`sc-risk-tag risk-${k.toLowerCase()}`}>
                            {k}: {v}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                );
              })}

              {result.routes.length === 0 && (
                <div className="error-card">
                  <p>Tidak ada shelter terjangkau dari titik ini.</p>
                </div>
              )}
            </div>

            {/* Grafik konvergensi GA */}
            <div className="sec-title">Konvergensi GA</div>
            <ConvergenceChart data={result.riwayat_fitness} />

            {/* Info 4 layer cluster */}
            <div className="sec-title">Legenda: 4-Layer K-Means</div>
            <div className="cluster-layers">
              <div className="cluster-item">
                <div className="cluster-color-box" style={{ background: "#2563eb" }}/>
                <span className="cluster-name">L1 -- Zona Shelter</span>
                <span className="cluster-count">3 kluster</span>
              </div>
              <div className="cluster-item">
                <div className="cluster-color-box" style={{ background: "#7c3aed" }}/>
                <span className="cluster-name">L2 -- Risiko Jalan</span>
                <span className="cluster-count">3 kluster</span>
              </div>
              <div className="cluster-item">
                <div className="cluster-color-box" style={{ background: "#d97706" }}/>
                <span className="cluster-name">L3 -- Kepadatan Area</span>
                <span className="cluster-count">4 kluster</span>
              </div>
              <div className="cluster-item">
                <div className="cluster-color-box" style={{ background: "#059669" }}/>
                <span className="cluster-name">L4 -- Kapasitas Shelter</span>
                <span className="cluster-count">3 kluster</span>
              </div>
            </div>

          </div>
        )}
      </div>
    </aside>
  );
}
