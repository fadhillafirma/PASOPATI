#!/bin/bash

# 1. Jalankan FastAPI backend di background (Port 8000)
python api_server.py &

# Wait a moment to ensure backend is up
sleep 2

# 2. Masuk ke folder frontend
cd frontend

# Set URL Backend agar Next.js bisa berkomunikasi secara lokal di dalam container
export BACKEND_URL="http://127.0.0.1:8000"

# 3. JALANKAN NEXT.JS DI PORT YANG DIMINTA GOOGLE CLOUD RUN
# Kita gunakan exec agar proses Next.js menjadi proses utama yang dikunci oleh Cloud Run
exec npm start -- -p ${PORT:-8080}