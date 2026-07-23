# X7 Rolamentos & Retentores

PWA para buscar rolamentos e retentores, montar lista de compras e enviar a mensagem para o WhatsApp.

## Rodar local

```bash
npm install
npm run dev
```

## Gerar build

```bash
npm run build
```

O site pronto fica em `dist/`.

## Cloudflare Pages

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

Tambem pode usar o `wrangler.toml` deste projeto com `pages_build_output_dir = "dist"`.

## Supabase

O Supabase nao substitui o Cloudflare Pages como hospedagem estatica principal. Para usar com Supabase, publique o conteudo de `dist/` em um bucket publico do Supabase Storage ou sirva os arquivos por uma Edge Function. O app nao depende de banco para funcionar offline; a lista fica salva no aparelho com `localStorage`.

## PWA offline

Depois do primeiro acesso online, o service worker salva a tela principal, manifesto, icone e arquivos gerados pelo Vite. A busca, catalogo e lista continuam funcionando offline. O envio pelo WhatsApp precisa de internet.
