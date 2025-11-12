/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "https://ujani-whatsapp-bot.onrender.com/api/:path*" },
      { source: "/socket.io/:path*", destination: "https://ujani-whatsapp-bot.onrender.com/socket.io/:path*" }
    ];
  }
};
module.exports = nextConfig;
