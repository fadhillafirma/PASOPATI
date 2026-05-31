#!/bin/bash

# Start FastAPI backend in the background
# It will listen on 0.0.0.0:8000
python api_server.py &

# Wait a moment to ensure backend is up (optional but good practice)
sleep 2

# Navigate to frontend and start the Next.js production server
# Cloud Run sets the $PORT environment variable automatically (default 8080)
cd frontend
export BACKEND_URL="http://127.0.0.1:8000"
npm start
