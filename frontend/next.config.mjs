/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*', // Proxy to Backend
      },
      {
        source: '/static/:path*',
        destination: 'http://127.0.0.1:8000/static/:path*', // Direct access to static files
      },
      {
        source: '/static/images/:path*',
        destination: 'http://127.0.0.1:8000/static/images/:path*', // Direct access to static images
      },
      {
        source: '/static/content/:path*',
        destination: 'http://127.0.0.1:8000/static/content/:path*', // Direct access to static content
      },
    ]
  },
};

export default nextConfig;