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

O worker não precisa de porta pública: ele busca trabalhos diretamente no Supabase. Se publicar a porta 8080 apenas para monitoramento, restrinja-a no firewall/reverse proxy e use `/health` para verificar o processo.

Downloads externos usam `COBALT_API_URL` e `COBALT_API_KEY`. A coleta de perfis do Instagram roda exclusivamente na API descrita em `instagram-api/README.md`.

O áudio é segmentado conforme `TRANSCRIPTION_CHUNK_SECONDS` e enviado ao endpoint dedicado de transcrição do OpenRouter. Nunca grave tokens no repositório ou em logs.
