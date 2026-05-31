/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy semua /api/* ke FastAPI backend
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
