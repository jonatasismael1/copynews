# Deploy

## Supabase

1. Vincule o projeto com `supabase link --project-ref ...`.
2. Aplique `supabase db push`.
3. Cadastre os segredos descritos em `.env.example` (sem prefixo `VITE_`).
4. Publique as funções com `supabase functions deploy`.

## Netlify

Conecte o repositório, use `npm run build` e publique `dist`. Cadastre `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_APP_TIMEZONE`. Repita a URL e a chave pública como `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` para as funções server-side do login do Instagram.

## Contabo / Portainer worker

Crie uma Stack no Portainer a partir deste repositório e informe `docker-compose.contabo.yml` como caminho do Compose. Cadastre as variáveis secretas no campo de ambiente da Stack (nunca no Git), mantenha uma única réplica durante a migração e confirme que o container fica `healthy`.

O worker não precisa de porta pública: ele busca trabalhos diretamente no Supabase. Se publicar a porta 8080 apenas para monitoramento, restrinja-a no firewall/reverse proxy e use `/health` para verificar o processo. Depois de confirmar o worker da Contabo, desligue a réplica da Railway para evitar dois consumidores concorrentes.

As integrações externas usam `COBALT_API_URL`, `COBALT_API_KEY`, `INSTALOADER_SERVICE_URL` e `INSTALOADER_SERVICE_API_KEY`. O Instaloader enriquece publicações do Instagram e, se estiver temporariamente limitado pelo Instagram, o fluxo mantém a leitura pública existente como fallback.

O áudio é segmentado conforme `TRANSCRIPTION_CHUNK_SECONDS` e enviado ao endpoint dedicado de transcrição do OpenRouter. Nunca grave tokens no repositório ou em logs.
