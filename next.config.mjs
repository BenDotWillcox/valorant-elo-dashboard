/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'raw.githubusercontent.com',
                port: '',
                pathname: '/BenDotWillcox/valorant-map-images/main/**',
            },
            {
                protocol: 'https',
                hostname: 'img.abiosgaming.com',
                port: '',
                pathname: '/**',
            }
        ],
    },
};

export default nextConfig;
