import json, math, os, random, sys, time
import pandas as pd
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import silhouette_score
import warnings

try:
    import rasterio
    from rasterio.windows import from_bounds
    _HAS_RASTERIO = True
except ImportError:
    _HAS_RASTERIO = False

warnings.filterwarnings("ignore", module="sklearn.cluster._kmeans")

_DIR    = os.path.dirname(os.path.abspath(__file__))
PENALTI = 1e9
_RISIKO = {
    "motorway": 0.10, "trunk": 0.15, "primary": 0.20, "secondary": 0.30,
    "tertiary": 0.40, "residential": 0.55, "service": 0.65,
    "footway": 0.75, "path": 0.80, "default": 0.50,
}
_KAP_DEFAULT = {
    "pendidikan": 1500, "masjid/mushola": 1000, "hotel": 2000,
    "bukit/lahan": 3000, "fasilitas kesehatan": 500, "default": 800,
}
PANTAI_LON = 100.37  # batas longitude pesisir



# UTILITAS
def _hav(lat1, lon1, lat2, lon2):
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2
         + math.cos(p1) * math.cos(p2)
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class GridIndex:
    def __init__(self, G, nodes, cell=0.005):
        self.G, self.cell, self.grid = G, cell, {}
        for n in nodes:
            d = G.nodes[n]
            key = (int(d["lat"] / cell), int(d["lon"] / cell))
            self.grid.setdefault(key, []).append(n)

    def terdekat(self, lat, lon):
        cx, cy = int(lat / self.cell), int(lon / self.cell)
        best, best_d = None, float("inf")
        for r in range(20):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if abs(dx) < r and abs(dy) < r:
                        continue
                    for n in self.grid.get((cx + dx, cy + dy), []):
                        nd = self.G.nodes[n]
                        d = (lat - nd["lat"]) ** 2 + (lon - nd["lon"]) ** 2
                        if d < best_d:
                            best_d, best = d, n
            if best is not None and r >= 1:
                break
        return best



# SINTAKS MUAT SHELTER & GRAF

def muat_shelter(path=None):
    path = path or os.path.join(_DIR, "shelter_evakuasi_padang_clean.csv")
    raw  = pd.read_csv(path)
    raw.columns = raw.columns.str.strip()
    rows = []
    for i, r in raw.iterrows():
        kap = r.get("KAPASITAS_JIWA")
        if pd.isna(kap):
            tipe = str(r.get("TIPE_SHELTER", "")).strip().lower()
            kap  = _KAP_DEFAULT.get(tipe, _KAP_DEFAULT["default"])
        else:
            kap = int(float(str(kap).replace(",", "").strip()) or 800)
        rows.append({
            "id": f"S{i+1:03d}", "nama": str(r["NAMA_SHELTER"]).strip(),
            "lat": float(r["LATITUDE"]), "lon": float(r["LONGITUDE"]),
            "kapasitas_max": kap,
        })
    df = pd.DataFrame(rows)
    print(f"  [Data] {len(df)} shelter dimuat.")
    return df


def bangun_graf(path=None):
    path = path or os.path.join(_DIR, "jaringan_jalan.geojson")
    with open(path, encoding="utf-8") as f:
        gj = json.load(f)
        
    G = nx.Graph()
    for fitur in gj.get("features", []):
        geom = fitur.get("geometry", {})
        if geom.get("type") != "LineString":
            continue
        coords = geom["coordinates"]
        props  = fitur.get("properties", {})
        hw     = props.get("highway") or "default"
        risiko = _RISIKO.get(hw, 0.50)
        if sum(c[0] for c in coords) / len(coords) < PANTAI_LON:
            risiko = min(risiko + 0.25, 0.95)
        for j in range(len(coords) - 1):
            lon1, lat1 = coords[j]
            lon2, lat2 = coords[j + 1]
            n1 = f"{lat1:.6f},{lon1:.6f}"
            n2 = f"{lat2:.6f},{lon2:.6f}"
            G.add_node(n1, lat=lat1, lon=lon1)
            G.add_node(n2, lat=lat2, lon=lon2)
            if not G.has_edge(n1, n2):
                jarak = _hav(lat1, lon1, lat2, lon2)
                G.add_edge(n1, n2, bobot=jarak * (1 + risiko),
                           jarak=jarak, faktor_risiko=round(risiko, 2),
                           nama_jalan=props.get("name") or "?")
    print(f"  [Data] Graf: {G.number_of_nodes()} node, {G.number_of_edges()} edge.")
    return G


def prakomputasi(df, G):
    lcc  = max(nx.connected_components(G), key=len)
    grid = GridIndex(G, lcc)
    s_map = {r["id"]: grid.terdekat(r["lat"], r["lon"]) for _, r in df.iterrows()}
    print(f"  [Data] {len(s_map)} shelter dipetakan ke graf (LCC={len(lcc)} node).")
    return lcc, s_map, grid


# ══════════════════════════════════════════════════════════════════════════════
# MACHINE LEARNING — 4 LAYER K-MEANS
# ══════════════════════════════════════════════════════════════════════════════

# ── Layer 1: Clustering Zona Shelter ────────────────────────────────────────
def ml_layer1_zona_shelter(df, n_clusters=3):
    """K-Means L1: Kelompokkan shelter ke zona geografis."""
    print(f"  [ML-L1] Clustering zona shelter ({n_clusters} kluster)...")
    X = df[["lat", "lon"]].values
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
    df["kluster_zona_id"] = km.fit_predict(X)

    score_l1 = silhouette_score(X, df["kluster_zona_id"])
    print(f"  [ML-L1] Silhouette Score: {score_l1:.3f}")

    centers    = km.cluster_centers_
    sorted_idx = np.argsort(centers[:, 0])[::-1]
    label_map  = {
        sorted_idx[1]: "Zona 0 (Urban / Pusat Kota)",
        sorted_idx[0]: "Zona 1 (Sub-Urban / Pinggiran)",
        sorted_idx[2]: "Zona 2 (Rural / Pesisir & Perbukitan)",
    }
    df["kategori_zona"] = df["kluster_zona_id"].map(label_map)
    km.label_map = label_map

    for cid, name in label_map.items():
        print(f"       - {name}: {(df['kluster_zona_id']==cid).sum()} shelter")
    return df, km


# ── Layer 2: Clustering Risiko Jalan ────────────────────────────────────────
def ml_layer2_risiko_jalan(G):
    """K-Means L2: Klasifikasi risiko segmen jalan → perbarui bobot graf."""
    print("  [ML-L2] Clustering risiko jalan...")
    edges = list(G.edges(data=True))
    if not edges:
        return G, None

    fitur = []
    for u, v, d in edges:
        lat_mid = (G.nodes[u]["lat"] + G.nodes[v]["lat"]) / 2
        lon_mid = (G.nodes[u]["lon"] + G.nodes[v]["lon"]) / 2
        fitur.append([d["jarak"], d["faktor_risiko"], lat_mid, lon_mid])

    X  = np.array(fitur)
    Xs = MinMaxScaler().fit_transform(X)
    km = KMeans(n_clusters=3, random_state=42, n_init="auto")
    labels = km.fit_predict(Xs)
    
    sample_size = min(2000, len(fitur))
    score_l2 = silhouette_score(Xs, labels, sample_size=sample_size, random_state=42)
    print(f"  [ML-L2] Silhouette Score (Sampled): {score_l2:.3f}")

    # Tentukan multiplier berdasarkan rata-rata faktor_risiko tiap kluster
    kluster_risiko = {}
    for cid in range(3):
        idx = [i for i, l in enumerate(labels) if l == cid]
        rata = np.mean([fitur[i][1] for i in idx])
        kluster_risiko[cid] = rata

    sorted_cid  = sorted(kluster_risiko, key=kluster_risiko.get)
    multiplier  = {sorted_cid[0]: 1.0, sorted_cid[1]: 1.5, sorted_cid[2]: 2.5}
    nama_risiko = {sorted_cid[0]: "Rendah", sorted_cid[1]: "Sedang", sorted_cid[2]: "Tinggi"}

    for i, (u, v, d) in enumerate(edges):
        cid = labels[i]
        G[u][v]["bobot"]      *= multiplier[cid]
        G[u][v]["zona_risiko"]  = nama_risiko[cid]

    for cid in sorted_cid:
        cnt = sum(1 for l in labels if l == cid)
        print(f"       - Risiko {nama_risiko[cid]} (×{multiplier[cid]}): {cnt} segmen")

    km.multiplier  = multiplier
    km.nama_risiko = nama_risiko
    return G, km


# ── Layer 3: Clustering Kepadatan Area ──────────────────────────────────────
def ml_layer3_kepadatan_area(G, lcc, n_clusters=4):
    """K-Means L3: Kluster kepadatan area → tentukan parameter GA adaptif."""
    print(f"  [ML-L3] Clustering kepadatan area ({n_clusters} zona)...")
    koordinat = [[G.nodes[n]["lat"], G.nodes[n]["lon"]] for n in lcc]
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
    labels = km.fit_predict(koordinat)
    
    sample_size = min(2000, len(koordinat))
    score_l3 = silhouette_score(koordinat, labels, sample_size=sample_size, random_state=42)
    print(f"  [ML-L3] Silhouette Score (Sampled): {score_l3:.3f}")

    # Urutkan centroid berdasarkan kepadatan (jumlah node terdekat) → proxy densitas
    centers = km.cluster_centers_
    labels_all = km.labels_
    kepadatan  = {cid: (labels_all == cid).sum() for cid in range(n_clusters)}
    sorted_cid = sorted(kepadatan, key=kepadatan.get)

    ga_params_map = {
        sorted_cid[0]: dict(n_grup=4,  generasi=40,  pop_size=15),   # sepi
        sorted_cid[1]: dict(n_grup=6,  generasi=80,  pop_size=30),   # sedang
        sorted_cid[2]: dict(n_grup=8,  generasi=120, pop_size=40),   # padat
        sorted_cid[3]: dict(n_grup=10, generasi=150, pop_size=50),   # sangat padat
    }
    nama_kepadatan = {
        sorted_cid[0]: "Sepi",
        sorted_cid[1]: "Sedang",
        sorted_cid[2]: "Padat",
        sorted_cid[3]: "Sangat Padat",
    }
    km.ga_params_map   = ga_params_map
    km.nama_kepadatan  = nama_kepadatan

    for cid in sorted_cid:
        print(f"       - {nama_kepadatan[cid]}: {kepadatan[cid]} node")
    return km


# ── Utilitas: Estimasi Demand dari Raster Populasi ─────────────────────────
def _hitung_estimasi_demand(df, radius_deg=0.005):
    """Hitung estimasi jumlah penduduk sekitar tiap shelter dari raster populasi.

    Args:
        df: DataFrame shelter dengan kolom lat, lon.
        radius_deg: Radius pencarian dalam derajat (~550m ≈ 0.005°).

    Returns:
        Series berisi estimasi demand (jumlah penduduk) per shelter.
    """
    tif_path = os.path.join(_DIR, "jumlah_populasi.tif")

    if not _HAS_RASTERIO or not os.path.exists(tif_path):
        print("  [ML-L4] WARN: rasterio/raster tidak tersedia, fallback ke proxy.")
        # Fallback: gunakan jumlah shelter terdekat sebagai proxy kepadatan
        return pd.Series(df["kapasitas_max"].values, index=df.index)

    print(f"  [ML-L4] Membaca raster populasi ({tif_path})...")
    raster = rasterio.open(tif_path)
    nodata = raster.nodata
    demands = []

    for _, row in df.iterrows():
        lat, lon = row["lat"], row["lon"]
        try:
            window = from_bounds(
                lon - radius_deg, lat - radius_deg,
                lon + radius_deg, lat + radius_deg,
                raster.transform,
            )
            data = raster.read(1, window=window)
            valid = data[(data != nodata) & (data > 0)] if nodata is not None else data[data > 0]
            demands.append(float(valid.sum()) if len(valid) > 0 else 0.0)
        except Exception:
            demands.append(0.0)

    raster.close()
    return pd.Series(demands, index=df.index)


# ── Layer 4: Clustering Kapasitas Shelter ───────────────────────────────────
def ml_layer4_kapasitas_shelter(df):
    """K-Means L4: Klasifikasi shelter berdasarkan rasio demand/kapasitas.

    Menggunakan data raster populasi untuk mengestimasi jumlah penduduk
    di sekitar shelter, lalu menghitung rasio demand/kapasitas.
    Shelter dengan rasio tinggi → RAWAN PENUH (kemungkinan besar kewalahan).
    """
    print("  [ML-L4] Clustering kapasitas shelter (berbasis demand populasi)...")

    # Hitung estimasi demand dari raster populasi
    df["estimasi_demand"] = _hitung_estimasi_demand(df)

    # Hitung rasio demand/kapasitas — semakin tinggi semakin rawan penuh
    df["rasio_demand_kapasitas"] = np.where(
        df["kapasitas_max"] > 0,
        df["estimasi_demand"] / df["kapasitas_max"],
        df["estimasi_demand"] / 800,  # fallback kapasitas default
    )

    # Fitur clustering: HANYA rasio demand/kapasitas agar tidak bias oleh lokasi.
    # Nilai rasio di-clip ke 10.0 (dilonggarkan) agar batas "RAWAN PENUH" lebih tinggi.
    # Karena secara alami demand (penduduk dlm radius 1km) memang sering 3x-6x lebih besar dari kapasitas,
    # batas yang lebih longgar ini membuat shelter berasio menengah masuk ke "CUKUP", tidak semuanya merah.
    rasio_clipped = np.clip(df["rasio_demand_kapasitas"], 0, 10.0)
    fitur = rasio_clipped.values.reshape(-1, 1)
    Xs    = MinMaxScaler().fit_transform(fitur)

    km     = KMeans(n_clusters=3, random_state=42, n_init="auto")
    labels = km.fit_predict(Xs)
    df["kluster_kap_id"] = labels
    
    score_l4 = silhouette_score(Xs, labels)
    print(f"  [ML-L4] Silhouette Score: {score_l4:.3f}")

    # Interpretasi: rata-rata rasio per kluster
    rasio_rata = {cid: df[df["kluster_kap_id"]==cid]["rasio_demand_kapasitas"].mean()
                  for cid in range(3)}
    sorted_cid = sorted(rasio_rata, key=rasio_rata.get)
    status_map = {sorted_cid[0]: "LEGA", sorted_cid[1]: "CUKUP", sorted_cid[2]: "RAWAN PENUH"}
    df["status_kapasitas_ml"] = df["kluster_kap_id"].map(status_map)
    km.status_map = status_map

    for cid in sorted_cid:
        cnt   = (df["kluster_kap_id"] == cid).sum()
        r_avg = rasio_rata[cid]
        print(f"       - {status_map[cid]}: {cnt} shelter "
              f"(rata rasio demand/kapasitas: {r_avg:.2f})")
    return df, km


# ══════════════════════════════════════════════════════════════════════════════
# ALGORITMA GENETIKA
# ══════════════════════════════════════════════════════════════════════════════
def _init_pop(ids, n_grup, ukuran):
    return [[random.choice(ids) for _ in range(n_grup)] for _ in range(ukuran)]

def _tournament(pop, fits, k=3):
    return pop[min(random.sample(range(len(pop)), k), key=lambda i: fits[i])]

def _crossover(p1, p2):
    if len(p1) <= 1: return p1[:], p2[:]
    t = random.randint(1, len(p1) - 1)
    return p1[:t] + p2[t:], p2[:t] + p1[t:]

def _mutasi(krom, ids, p=0.15):
    return [random.choice(ids) if random.random() < p else g for g in krom]

def _fitness(krom, dist, s_map, kap_sisa, status_ml=None):
    """Hitung fitness kromosom. Shelter RAWAN PENUH dapat penalty tambahan."""
    beban, total = {}, 0.0
    for s in krom:
        beban[s] = beban.get(s, 0) + 1
        d = dist.get(s_map.get(s, ""), float("inf"))
        # Soft penalty: shelter RAWAN PENUH dapat multiplier jarak 2x
        if status_ml and status_ml.get(s) == "RAWAN PENUH":
            d *= 2.0
        elif status_ml and status_ml.get(s) == "CUKUP":
            d *= 1.2  # sedikit lebih mahal dari LEGA
        total += d
    for s, jml in beban.items():
        if jml > kap_sisa.get(s, 0):
            total += PENALTI
    return total


def jalankan_ga(koordinat, df_shelter, km_l1, km_l3, km_l4, G, lcc, s_map, grid, jumlah_orang=100):
    """Fungsi utama untuk dijalankan oleh API FastAPI."""
    df = df_shelter.copy()
    lat, lon = koordinat

    # ── ML Layer 1: Prediksi zona pengguna ──────────────────────────────────
    user_cluster_id = km_l1.predict([[lat, lon]])[0]
    user_zona_name  = km_l1.label_map[user_cluster_id]
    print(f"  [ML-L1] Pengguna di {user_zona_name}")

    # ── ML Layer 3: Prediksi kepadatan → parameter GA ───────────────────────
    kepadatan_id  = km_l3.predict([[lat, lon]])[0]
    kepadatan_nama = km_l3.nama_kepadatan[kepadatan_id]
    ga_params      = km_l3.ga_params_map[kepadatan_id]
    print(f"  [ML-L3] Kepadatan area: {kepadatan_nama} → "
          f"generasi={ga_params['generasi']}, pop={ga_params['pop_size']}")

    # ── ML Layer 4: Soft penalty (bukan hard filter) ────────────────────────
    # Semua shelter di zona tetap masuk kandidat, tapi RAWAN PENUH mendapat
    # penalty jarak di fitness function
    df_zona = df[
        df["kluster_zona_id"] == user_cluster_id
    ].reset_index(drop=True)
    total_shelter_zona = len(df_zona)
    n_rawan = (df_zona["status_kapasitas_ml"] == "RAWAN PENUH").sum()
    print(f"  [ML-L4] {total_shelter_zona} shelter di zona "
          f"({n_rawan} RAWAN PENUH → diberi penalty jarak).")

    node_user = grid.terdekat(lat, lon)

    # ── Dijkstra (graf sudah diperbarui L2) ─────────────────────────────────
    dist = nx.single_source_dijkstra_path_length(G, node_user, weight="bobot")

    ids_ok = [s for s, n in s_map.items()
              if n in dist and s in set(df_zona["id"])]
    df_ok  = df_zona[df_zona["id"].isin(ids_ok)].reset_index(drop=True)
    ids    = df_ok["id"].tolist()
    print(f"  [Info] {len(ids)} shelter terjangkau untuk GA.")

    if not ids:
        return {
            "node_asal": node_user, "fitness_terbaik": float("inf"),
            "kromosom": [], "detail_shelter": [], "riwayat_fitness": [],
            "nama_zona": user_zona_name, "kepadatan": kepadatan_nama,
            "total_shelter_zona": total_shelter_zona,
        }

    kap_sisa  = {r["id"]: r["kapasitas_max"] for _, r in df_ok.iterrows()}
    status_ml = {r["id"]: r["status_kapasitas_ml"] for _, r in df_ok.iterrows()}

    # ── Evolusi GA ───────────────────────────────────────────────────────────
    n_grup    = ga_params["n_grup"]
    generasi  = ga_params["generasi"]
    pop_size  = ga_params["pop_size"]
    pop       = _init_pop(ids, n_grup, pop_size)
    best_k    = pop[0][:]
    best_f    = float("inf")
    riwayat   = []

    for _ in range(generasi):
        fits = [_fitness(k, dist, s_map, kap_sisa, status_ml) for k in pop]
        idx  = min(range(len(pop)), key=lambda i: fits[i])
        if fits[idx] < best_f:
            best_f, best_k = fits[idx], pop[idx][:]
        riwayat.append(best_f)
        baru = [best_k[:]]
        while len(baru) < pop_size:
            p1 = _tournament(pop, fits)
            p2 = _tournament(pop, fits)
            c1, c2 = (_crossover(p1, p2) if random.random() < 0.80
                      else (p1[:], p2[:]))
            baru.append(_mutasi(c1, ids))
            if len(baru) < pop_size:
                baru.append(_mutasi(c2, ids))
        pop = baru

    hasil = _susun_hasil(best_k, best_f, node_user, df_ok, s_map, dist, riwayat, jumlah_orang)
    hasil.update({
        "nama_zona": user_zona_name,
        "kepadatan": kepadatan_nama,
        "total_shelter_zona": total_shelter_zona,
    })
    return hasil


def _susun_hasil(krom, fit_val, node_user, df, s_map, dist, riwayat, jumlah_orang):
    info    = df.set_index("id").to_dict("index")
    alokasi = {}
    for s in krom:
        alokasi[s] = alokasi.get(s, 0) + 1
    
    n_grup = len(krom)
    detail = []
    sisa_alokasi = jumlah_orang
    alokasi_items = list(alokasi.items())
    
    for i, (sid, jml) in enumerate(alokasi_items):
        if i == len(alokasi_items) - 1:
            alokasi_orang = sisa_alokasi
        else:
            alokasi_orang = round(jumlah_orang * (jml / n_grup))
            sisa_alokasi -= alokasi_orang
            
        d    = info[sid]
        sisa = d["kapasitas_max"] - alokasi_orang
        detail.append({
            "shelter_id": sid, "nama": d["nama"],
            "lat": d["lat"], "lon": d["lon"],
            "jumlah_orang": alokasi_orang,
            "bobot_rute":  round(dist.get(s_map[sid], float("inf")), 2),
            "kapasitas_max": d["kapasitas_max"],
            "sisa_kapasitas": sisa,
            "status_kapasitas": "AMAN" if sisa >= 0 else "OVERLOAD",
            "status_ml": d.get("status_kapasitas_ml", "-"),
        })
    detail.sort(key=lambda x: x["bobot_rute"])
    return {
        "node_asal": node_user,
        "fitness_terbaik": round(fit_val, 2),
        "kromosom": krom,
        "detail_shelter": detail,
        "riwayat_fitness": riwayat,
    }


# ══════════════════════════════════════════════════════════════════════════════
# VISUALISASI
# ══════════════════════════════════════════════════════════════════════════════
def plot_konvergensi(riwayat):
    plt.figure(figsize=(8, 4))
    plt.plot(range(1, len(riwayat) + 1), riwayat, marker="o",
             color="b", linestyle="-", markersize=3)
    plt.title("Konvergensi Algoritma Genetika")
    plt.xlabel("Generasi Ke-")
    plt.ylabel("Nilai Fitness Terbaik")
    plt.grid(True)
    plt.tight_layout()
    plt.show()


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("\n  === Sistem Evakuasi Tsunami - Kota Padang ===\n")
    t0 = time.time()

    df_shelter = muat_shelter()
    G          = bangun_graf()
    lcc, s_map, grid = prakomputasi(df_shelter, G)

    print("\n  [ML] Training 4 Layer K-Means...")
    df_shelter, km_l1 = ml_layer1_zona_shelter(df_shelter, n_clusters=3)
    G,          km_l2 = ml_layer2_risiko_jalan(G)
    km_l3             = ml_layer3_kepadatan_area(G, lcc, n_clusters=4)
    df_shelter, km_l4 = ml_layer4_kapasitas_shelter(df_shelter)

    print(f"\n  [Perf] Inisialisasi selesai dalam {time.time()-t0:.2f}s\n")

    # Mode CLI: python ga_evakuasi_tsunami.py <lat> <lon>
    if len(sys.argv) == 3:
        lat_arg, lon_arg = float(sys.argv[1]), float(sys.argv[2])
        hasil = jalankan_ga((lat_arg, lon_arg),
                            df_shelter, km_l1, km_l3, km_l4,
                            G, lcc, s_map, grid)
        print(json.dumps(hasil, ensure_ascii=False))
    else:
        print("  Penggunaan: python ga_evakuasi_tsunami.py <lat> <lon>")
        print("  Atau jalankan api_server.py untuk mode web.")
