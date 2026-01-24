/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd3ay3etzd1512y.cloudfront.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'credit-card-data-site.s3.us-east-2.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
