#!/bin/bash
set -e

# 1. Jalankan FastAPI backend di background pada port internal.
# Cloud Run hanya mengekspos port Next.js, jadi backend jangan memakai $PORT.
export BACKEND_PORT="${BACKEND_PORT:-8000}"
python api_server.py &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Tunggu sampai FastAPI benar-benar siap sebelum Next.js menerima traffic.
for i in $(seq 1 240); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "FastAPI backend stopped before it became ready."
    exit 1
  fi

  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi

  if [ "$i" -eq 240 ]; then
    echo "FastAPI backend was not ready after 240 seconds."
    exit 1
  fi

  sleep 1
done

# 2. Masuk ke folder frontend
cd frontend

# Set URL Backend agar Next.js bisa berkomunikasi secara lokal di dalam container
export BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"

# 3. JALANKAN NEXT.JS DI PORT YANG DIMINTA GOOGLE CLOUD RUN
# Kita gunakan exec agar proses Next.js menjadi proses utama yang dikunci oleh Cloud Run
exec npm start -- -p "${PORT:-8080}" -H 0.0.0.0
