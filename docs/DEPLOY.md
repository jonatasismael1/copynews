# Deploy

## Supabase

1. Vincule o projeto com `supabase link --project-ref ...`.
2. Aplique `supabase db push`.
3. Cadastre os segredos descritos em `.env.example` (sem prefixo `VITE_`).
4. Publique as funções com `supabase functions deploy`.

## Netlify

Conecte o repositório, use `npm run build` e publique `dist`. Cadastre apenas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_APP_TIMEZONE`.

## Railway worker

O serviço `copy-news-worker` usa o `railway.json` da raiz e `worker/Dockerfile`. Publique a raiz do repositório com `railway up --service copy-news-worker --environment production`, cadastre os segredos de backend, mantenha ao menos uma réplica ativa e use `/health` para verificar o processo.

O áudio é segmentado conforme `TRANSCRIPTION_CHUNK_SECONDS` e enviado ao endpoint dedicado de transcrição do OpenRouter. Nunca grave tokens no repositório ou em logs.
