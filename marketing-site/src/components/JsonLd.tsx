// Server component that injects a JSON-LD <script> for rich-result eligibility.
// Renders raw JSON — never user input, so dangerouslySetInnerHTML is safe here.

export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
    return (
        <script
            type="application/ld+json"
            // JSON.stringify escapes </script> sequences are still a risk only with
            // user content; all data here is static and authored, so this is safe.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
        />
    );
}
