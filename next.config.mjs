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
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'ALLOWALL',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: 'frame-ancestors *',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
