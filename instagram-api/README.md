# Copy News Instagram Analytics API

API FastAPI para dados públicos do Instagram, com provedores em fallback, histórico no Supabase e coleta às 07:00, 12:00, 19:00 e 22:00 em `America/Maceio`.

## Implantação

1. Aplique as migrations de `supabase/migrations`.
2. Copie `.env.example` para `.env` e preencha todas as quatro variáveis obrigatórias: `DATABASE_URL`, `API_KEY`, `DEFAULT_ORGANIZATION_ID` e `DEFAULT_CREATED_BY`.
3. Os dois UUIDs definem a organização isolada pela API e o usuário de auditoria. Um cadastro pode sobrescrevê-los no payload quando necessário.
4. Execute `docker compose up -d --build` neste diretório.
5. Confirme com `curl http://localhost:8010/health`.

Em VPS IPv4, use a conexão **Session pooler** do Supabase, porta 5432. Envie `API_KEY` no header `X-API-Key`. Nunca exponha credenciais do banco ou uma chave `service_role` no navegador.

No Portainer, crie uma Stack apontando para o repositório e use `instagram-api/docker-compose.yml`; cadastre as variáveis da Stack e coloque a porta 8010 atrás de HTTPS/reverse proxy.

## Endpoints

- `GET /health`
- `GET /profiles`
- `POST /profiles` com `{"username":"perfil"}`
- `POST /profiles/{username}/refresh`
- `GET /profiles/{username}/analytics`
- `GET /posts/{shortcode}/snapshots`
- `POST /collect/all`

Os endpoints de coleta retornam HTTP 202 antes do scraping. Acompanhe `last_sync_status` em `/profiles`. A documentação interativa fica em `/docs` e os logs em `docker compose logs -f instagram-api`.

O único provedor é o Actor `apidojo/instagram-scraper`, executado pela API oficial do Apify. Configure `APIFY_TOKEN` somente no ambiente do servidor. A coleta dos perfis ativos é feita em lote quatro vezes por dia no fuso `America/Maceio`.
