import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/explorer/trove/:troveId/:branch(ETH)",
        destination: "/trove/WETH/:troveId",
        permanent: true,
      },
      {
        source: "/explorer/trove/:troveId/:branch",
        destination: "/trove/:branch/:troveId",
        permanent: true, // 308 permanent redirect
      },
      {
        source: "/explorer",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
