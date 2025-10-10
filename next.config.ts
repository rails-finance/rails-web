import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/explorer/trove/:troveId/:branch",
        destination: "/trove/:branch/:troveId",
        permanent: true, // 308 permanent redirect
      },
    ];
  },
};

export default nextConfig;
