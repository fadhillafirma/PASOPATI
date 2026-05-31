# Base image: Python 3.10 slim
FROM python:3.10-slim

# Install system dependencies including curl (needed for Node.js)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (version 20)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy python dependencies
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything into the container
COPY . .

# Build the frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Make the start script executable
WORKDIR /app
RUN chmod +x start.sh

# Cloud Run expected port for Next.js is 8080.
# The start.sh script will run Next.js and it will pick up the $PORT env var.
# Expose port (Cloud Run sets this automatically, but good for documentation)
EXPOSE 8080

# Start both servers
CMD ["./start.sh"]
