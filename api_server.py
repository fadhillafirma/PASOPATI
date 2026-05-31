"""
FastAPI Backend — Sistem Evakuasi Tsunami Kota Padang
Wraps the existing GA + 4-Layer K-Means model for web access.
"""

import json, math, os, sys, time
import numpy as np
import networkx as nx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── Ensure local imports work ───────────────────────────────────────────────
_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _DIR)

from ga_evakuasi_tsunami import (
    muat_shelter,
    bangun_graf,
    prakomputasi,
    ml_layer1_zona_shelter,
    ml_layer2_risiko_jalan,
    ml_layer3_kepadatan_area,
    ml_layer4_kapasitas_shelter,
    jalankan_ga,
)

# ═══════════════════════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════════════════════
app = FastAPI(title="Sistem Evakuasi Tsunami – Kota Padang")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state (filled on startup) ────────────────────────────────────────
_state: dict = {}
_boundary_cache: dict | None = None


# ── Helpers ─────────────────────────────────────────────────────────────────
def _py(obj):
    """Convert numpy / inf values to JSON-safe Python types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return 1e18 if math.isinf(v) else v
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, float) and math.isinf(obj):
        return 1e18
    if isinstance(obj, dict):
        return {k: _py(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return type(obj)(_py(v) for v in obj)
    return obj


# ── Request / Response models ───────────────────────────────────────────────
class OptimizeRequest(BaseModel):
    lat: float
    lon: float
    jumlah_orang: int = 100


# ═══════════════════════════════════════════════════════════════════════════
# STARTUP
# ═══════════════════════════════════════════════════════════════════════════
@app.on_event("startup")
async def startup():
    print("\n  === Initializing Tsunami Evacuation System ===\n")
    t0 = time.time()

    df_shelter = muat_shelter()
    G = bangun_graf()
    lcc, s_map, grid = prakomputasi(df_shelter, G)

    print("\n  [ML] Training 4 Layer K-Means ...")
    df_shelter, km_l1 = ml_layer1_zona_shelter(df_shelter, n_clusters=3)
    G, km_l2 = ml_layer2_risiko_jalan(G)
    km_l3 = ml_layer3_kepadatan_area(G, lcc, n_clusters=4)
    df_shelter, km_l4 = ml_layer4_kapasitas_shelter(df_shelter)

    print(f"\n  [Perf] Initialization done in {time.time() - t0:.2f}s\n")

    _state.update(
        df_shelter=df_shelter,
        G=G,
        lcc=lcc,
        s_map=s_map,
        grid=grid,
        km_l1=km_l1,
        km_l2=km_l2,
        km_l3=km_l3,
        km_l4=km_l4,
    )


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "ready": bool(_state)}


@app.get("/api/shelters")
async def get_shelters():
    df = _state["df_shelter"]
    shelters = []
    for _, r in df.iterrows():
        shelters.append(
            {
                "id": r["id"],
                "nama": r["nama"],
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "kapasitas_max": int(r["kapasitas_max"]),
                "kluster_zona_id": int(r["kluster_zona_id"]),
                "kategori_zona": r["kategori_zona"],
                "status_kapasitas_ml": r["status_kapasitas_ml"],
                "estimasi_demand": round(float(r.get("estimasi_demand", 0)), 1),
                "rasio_demand_kapasitas": round(float(r.get("rasio_demand_kapasitas", 0)), 2),
            }
        )
    return {"shelters": shelters, "count": len(shelters)}


@app.get("/api/clusters")
async def get_clusters():
    km_l1 = _state["km_l1"]
    km_l3 = _state["km_l3"]
    df = _state["df_shelter"]

    # Layer 1: Zona shelter ──────────────────────────────────────────────────
    l1_data = {}
    for cid, name in km_l1.label_map.items():
        cshelters = df[df["kluster_zona_id"] == cid]
        l1_data[int(cid)] = {
            "name": name,
            "center": km_l1.cluster_centers_[cid].tolist(),
            "shelter_count": int(len(cshelters)),
            "bounds": {
                "min_lat": float(cshelters["lat"].min()),
                "max_lat": float(cshelters["lat"].max()),
                "min_lon": float(cshelters["lon"].min()),
                "max_lon": float(cshelters["lon"].max()),
            },
            "shelters_latlng": cshelters[["lat", "lon"]].values.tolist(),
        }

    # Layer 3: Kepadatan area ────────────────────────────────────────────────
    l3_data = {}
    for cid, name in km_l3.nama_kepadatan.items():
        l3_data[int(cid)] = {
            "name": name,
            "center": km_l3.cluster_centers_[cid].tolist(),
            "ga_params": km_l3.ga_params_map[cid],
        }

    return {"layer1_zona": l1_data, "layer3_kepadatan": l3_data}


@app.post("/api/optimize")
async def optimize(req: OptimizeRequest):
    t0 = time.time()

    hasil = jalankan_ga(
        (req.lat, req.lon),
        _state["df_shelter"],
        _state["km_l1"],
        _state["km_l3"],
        _state["km_l4"],
        _state["G"],
        _state["lcc"],
        _state["s_map"],
        _state["grid"],
        jumlah_orang=req.jumlah_orang,
    )

    G = _state["G"]
    s_map = _state["s_map"]
    node_user = hasil["node_asal"]

    # ── Reconstruct actual paths for each recommended shelter ────────────
    routes = []
    for shelter in hasil.get("detail_shelter", []):
        sid = shelter["shelter_id"]
        target_node = s_map.get(sid)
        path_coords = []
        total_distance = 0
        risk_segments = {"Rendah": 0, "Sedang": 0, "Tinggi": 0}

        try:
            if target_node and node_user:
                path_nodes = nx.dijkstra_path(
                    G, node_user, target_node, weight="bobot"
                )
                path_coords = [
                    [float(G.nodes[n]["lat"]), float(G.nodes[n]["lon"])]
                    for n in path_nodes
                ]
                for i in range(len(path_nodes) - 1):
                    edge = G[path_nodes[i]][path_nodes[i + 1]]
                    total_distance += edge.get("jarak", 0)
                    risk = edge.get("zona_risiko", "Sedang")
                    risk_segments[risk] = risk_segments.get(risk, 0) + 1
        except (nx.NetworkXNoPath, nx.NodeNotFound, KeyError):
            path_coords = []

        routes.append(
            {
                "shelter_id": shelter["shelter_id"],
                "nama": shelter["nama"],
                "lat": float(shelter["lat"]),
                "lon": float(shelter["lon"]),
                "jumlah_orang": int(shelter["jumlah_orang"]),
                "bobot_rute": _py(shelter["bobot_rute"]),
                "jarak_meter": round(total_distance, 1),
                "kapasitas_max": int(shelter["kapasitas_max"]),
                "sisa_kapasitas": int(shelter["sisa_kapasitas"]),
                "status_kapasitas": shelter["status_kapasitas"],
                "status_ml": shelter["status_ml"],
                "risk_segments": risk_segments,
                "path": path_coords,
            }
        )

    # ── Smart sort: prioritaskan shelter AMAN (LEGA/CUKUP) terdekat ──────
    # Shelter RAWAN PENUH tetap ditampilkan, tapi di-deprioritaskan
    _STATUS_PRIORITY = {"LEGA": 0, "CUKUP": 1, "RAWAN PENUH": 2}
    routes.sort(key=lambda r: (
        _STATUS_PRIORITY.get(r["status_ml"], 9),  # status aman duluan
        r["jarak_meter"],                           # lalu jarak terdekat
    ))

    # Beri alasan rekomendasi di setiap route
    for idx, r in enumerate(routes):
        st = r["status_ml"]
        jarak_km = r["jarak_meter"] / 1000
        if st == "LEGA":
            r["alasan_rekomendasi"] = (
                f"Kapasitas lega & jarak {jarak_km:.2f} km — "
                "shelter ini aman dari risiko kepenuhan."
            )
        elif st == "CUKUP":
            r["alasan_rekomendasi"] = (
                f"Kapasitas cukup & jarak {jarak_km:.2f} km — "
                "masih tersedia ruang yang memadai."
            )
        else:
            r["alasan_rekomendasi"] = (
                f"⚠ Rawan penuh (jarak {jarak_km:.2f} km) — "
                "mungkin tidak tersedia cukup ruang. "
                "Pertimbangkan shelter di atasnya."
            )

    # Tandai rekomendasi utama (shelter AMAN terdekat)
    rekomendasi_utama = None
    for r in routes:
        if r["status_ml"] in ("LEGA", "CUKUP"):
            rekomendasi_utama = {
                "shelter_id": r["shelter_id"],
                "nama": r["nama"],
                "jarak_meter": r["jarak_meter"],
                "status_ml": r["status_ml"],
                "alasan": (
                    f"Shelter terdekat dengan kapasitas {r['status_ml'].lower()} "
                    f"(jarak {r['jarak_meter']/1000:.2f} km). "
                    "Diprioritaskan karena tidak rawan penuh."
                ),
            }
            break

    dt = time.time() - t0

    user_nd = G.nodes.get(node_user, {})
    riwayat = [
        float(x) if not math.isinf(x) else 1e18
        for x in hasil.get("riwayat_fitness", [])
    ]

    return {
        "user_lat": req.lat,
        "user_lon": req.lon,
        "user_node_lat": float(user_nd.get("lat", req.lat)),
        "user_node_lon": float(user_nd.get("lon", req.lon)),
        "nama_zona": hasil.get("nama_zona", "-"),
        "kepadatan": hasil.get("kepadatan", "-"),
        "total_shelter_zona": _py(hasil.get("total_shelter_zona", 0)),
        "fitness_terbaik": _py(hasil.get("fitness_terbaik", 0)),
        "routes": routes,
        "rekomendasi_utama": rekomendasi_utama,
        "riwayat_fitness": riwayat,
        "waktu_komputasi": round(dt, 3),
    }


@app.get("/api/boundary")
async def get_boundary():
    global _boundary_cache
    if _boundary_cache is None:
        path = os.path.join(_DIR, "padang.geojson")
        with open(path, encoding="utf-8") as f:
            _boundary_cache = json.load(f)
    return _boundary_cache


# ═══════════════════════════════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
