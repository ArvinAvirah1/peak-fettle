// Route-change page transition (2026-06-10 aesthetic pass). App Router
// re-mounts template.tsx on every navigation, so the .page-enter animation
// (globals.css) gives each page a soft fade-rise. Pure CSS — no animation
// library — and disabled under prefers-reduced-motion.

export default function Template({ children }: { children: React.ReactNode }) {
    return <div className="page-enter">{children}</div>;
}
