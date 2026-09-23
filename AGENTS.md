<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all
differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notably: `middleware.ts` is deprecated and renamed to `proxy.ts`. Writing
`middleware.ts` does not error — it simply never runs, which is the worst
possible failure mode for an access gate.
<!-- END:nextjs-agent-rules -->

# Arquitetura

Vertical Slice. Antes de escrever código, ler `docs/adr/0001-vertical-slice.md`.
Em resumo: regra de negócio NÃO mora em handler HTTP; `src/shared` é função pura
(sem `next`, sem `supabase`, sem `fetch`, sem `Date.now()` interno).
