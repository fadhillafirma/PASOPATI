"use client";

import React from "react";

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing-container">
      <div className="landing-content">
        <div className="hero-section">
          <h1 className="hero-title">Sistem Evakuasi Bencana</h1>
          <p className="hero-subtitle">
            Kota Padang, Sumatera Barat
          </p>
          <p className="hero-desc">
            Aplikasi cerdas pencarian rute aman berbasis <strong>Machine Learning (4-Layer K-Means)</strong> dan <strong>Algoritma Genetika</strong> untuk meminimalkan risiko saat evakuasi darurat bencana.
          </p>
          <button type="button" className="start-btn" onClick={onStart}>
            Mulai Aplikasi
          </button>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20m-10-10h20"/></svg>
            </div>
            <h3>Analisis Spasial</h3>
            <p>Memetakan 147 shelter dan lebih dari 100 ribu ruas jalan di Kota Padang untuk mencari jalur paling efisien.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            </div>
            <h3>4-Layer K-Means</h3>
            <p>Model pengelompokan risiko berdasarkan Zona Wilayah, Kepadatan Penduduk, Risiko Jalan, dan Kapasitas Shelter.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: "var(--green-soft)", color: "var(--green)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 22h20L12 2z"/></svg>
            </div>
            <h3>Algoritma Genetika</h3>
            <p>Mencari rute evakuasi terpendek dengan mempertimbangkan penalti risiko di setiap jalan untuk keselamatan maksimal.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
