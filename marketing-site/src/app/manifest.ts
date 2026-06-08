import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: SITE.name,
        short_name: SITE.name,
        description: SITE.description,
        start_url: '/',
        display: 'standalone',
        background_color: '#06080F',
        theme_color: '#06080F',
        icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
    };
}
