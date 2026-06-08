import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();
    const routes: { path: string; priority: number; freq: 'weekly' | 'monthly' | 'yearly' }[] = [
        { path: '', priority: 1.0, freq: 'weekly' },
        { path: '/features', priority: 0.8, freq: 'monthly' },
        { path: '/pricing', priority: 0.8, freq: 'monthly' },
        { path: '/about', priority: 0.6, freq: 'monthly' },
        { path: '/privacy', priority: 0.3, freq: 'yearly' },
        { path: '/terms', priority: 0.3, freq: 'yearly' },
    ];
    return routes.map((r) => ({
        url: `${SITE.url}${r.path}`,
        lastModified: now,
        changeFrequency: r.freq,
        priority: r.priority,
    }));
}
