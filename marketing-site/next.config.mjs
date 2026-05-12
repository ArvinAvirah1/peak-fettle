/** @type {import('next').NextConfig} */
const nextConfig = {
    // All images inlined at build time — no external image domains needed yet.
    // When we add user avatars / exercise photos, add their domains here.
    images: {
        unoptimized: false,
    },

    // Strict mode catches subtle React issues during development.
    reactStrictMode: true,

    // Headers for security + Lighthouse best-practices score.
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Content-Type-Options',    value: 'nosniff' },
                    { key: 'X-Frame-Options',           value: 'DENY' },
                    { key: 'X-XSS-Protection',          value: '1; mode=block' },
                    { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy',
                      value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
        ];
    },
};

export default nextConfig;
