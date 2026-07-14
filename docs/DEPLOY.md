# Deploy

## Supabase

1. Vincule o projeto com `supabase link --project-ref ...`.
2. Aplique `supabase db push`.
3. Cadastre os segredos descritos em `.env.example` (sem prefixo `VITE_`).
4. Publique as funções com `supabase functions deploy`.

## Netlify

Conecte o repositório, use `npm run build` e publique `dist`. Cadastre apenas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_APP_TIMEZONE`.

## Railway worker

Crie um serviço a partir do mesmo GitHub, usando `worker/Dockerfile`. Cadastre os segredos de backend e mantenha ao menos uma réplica ativa. O endpoint `/health` informa o estado do processo.
