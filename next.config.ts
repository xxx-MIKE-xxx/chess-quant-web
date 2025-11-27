import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  
  async rewrites() {
    return [
      {
        // This makes the frontend call to /api/py_tilt 
        // transparently map to the Vercel Python Function
        source: '/api/py_tilt',
        destination: '/api/py_tilt', 
      },
    ];
  },
};

export default nextConfig;