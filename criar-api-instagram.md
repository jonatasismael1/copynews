Perfeito — agora vou te orientar **do jeito certo para Portainer**, porque aqui muda completamente a forma de execução.

Você não está mais em “ambiente de código”, você está em **orquestração de containers em produção**.

Então vou te entregar o que o Codex precisa gerar **já no formato Portainer Stack (Docker Compose pronto para deploy)** + o fluxo real de implantação.

---

# ✅ O QUE VOCÊ VAI FAZER NO PORTAINER (SEM AMBIGUIDADE)

## 1. Criar um STACK novo

No Portainer:

> **Stacks → Add stack**

Nome sugerido:

```
instagram-analytics
```

---

## 2. COLAR ESTE DOCKER COMPOSE (PRONTO PARA PRODUÇÃO)

```yaml
version: "3.9"

services:
  instagram-api:
    image: python:3.11-slim
    container_name: instagram-analytics-api
    working_dir: /app
    restart: always

    environment:
      - TZ=America/Maceio
      - DATABASE_URL=${DATABASE_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - INSTAGRAM_PROVIDER_ORDER=graphql,web,gallerydl,playwright
      - PYTHONUNBUFFERED=1

    volumes:
      - instagram_app:/app

    command: >
      bash -c "
      apt-get update &&
      apt-get install -y git curl ffmpeg &&
      pip install --no-cache-dir fastapi uvicorn httpx psycopg2-binary sqlalchemy alembic python-dotenv playwright gallery-dl &&
      playwright install --with-deps &&
      if [ ! -d /app/src ]; then
        echo 'Clonando backend...';
        git clone https://SEU_REPO_AQUI.git /app;
      fi &&
      cd /app &&
      alembic upgrade head || true &&
      uvicorn src.main:app --host 0.0.0.0 --port 8000
      "

    ports:
      - "8010:8000"

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  instagram_app:
```

---

# ⚠️ IMPORTANTE (PORTAINER REALIDADE)

Você precisa entender isso:

### O Portainer NÃO vai:

- criar seu código
- criar scraper
- criar banco
- criar API

👉 Ele só executa container

---

# ✅ O QUE O CODex PRECISA GERAR (OBRIGATÓRIO)

Agora vem a parte crítica.

Você precisa ter um repositório com:

```
/src
  main.py
  providers/
  collectors/
  services/
  db/
  models/
  routes/
  scheduler/
  analytics/
alembic/
Dockerfile
```

---

# 🧠 ARQUITETURA REAL (O QUE VAI RODAR NO CONTAINER)

## 1. FastAPI

```
src/main.py
```

- /health
- /profiles
- /refresh
- /analytics
- /collect

---

## 2. Collector Engine

```
collectors/instagram_collector.py
```

Responsável por:

- buscar perfil
- buscar posts
- atualizar snapshots
- evitar duplicação

---

## 3. Providers (PLUGÁVEIS)

```
providers/
  graphql_provider.py
  web_provider.py
  gallerydl_provider.py
  playwright_provider.py
```

Regra:

```
try graphql
→ fallback web
→ fallback gallery-dl
→ fallback playwright
```

---

## 4. Scheduler (CRÍTICO)

```
scheduler/job.py
```

Rodar:

- 07:00
- 12:00
- 19:00
- 22:00

Timezone:

```
America/Maceio
```

---

## 5. Banco (Supabase)

Você NÃO cria banco local.

Só:

- SQL migrations via Alembic
- conexão via env

---

# 🔥 O ERRO QUE VOCÊ NÃO PODE COMETER

❌ NÃO rodar scraping direto no endpoint\
❌ NÃO fazer scraping síncrono no request\
❌ NÃO depender de login Instagram\
❌ NÃO usar Instaloader como base\
❌ NÃO usar Apify / BrightData

---

# 🚀 FLUXO REAL DE FUNCIONAMENTO

```
Portainer Stack
      ↓
FastAPI Container
      ↓
Scheduler (4x ao dia)
      ↓
Collector Engine
      ↓
Instagram (public endpoints)
      ↓
Supabase
      ↓
Snapshots históricos
      ↓
Dashboard existente
```

---

# 📌 ENDPOINTS OBRIGATÓRIOS

```
GET  /health
GET  /profiles
POST /profiles
POST /profiles/{username}/refresh
GET  /profiles/{username}/analytics
GET  /posts/{shortcode}/snapshots
POST /collect/all
```

---

# 📊 SNAPSHOTS (REGRA CRÍTICA)

Você deve salvar SEMPRE histórico:

```json
{
  "likes": 1200,
  "views": 45000,
  "collected_at": "2026-01-23T19:00:00"
}
```

Nunca sobrescrever.

---

# ⏱ SCHEDULER (PORTAINER SAFE)

Use APScheduler:

```python
from apscheduler.schedulers.background import BackgroundScheduler
from pytz import timezone

scheduler = BackgroundScheduler(timezone=timezone("America/Maceio"))
```

---

# 🔐 VARIÁVEIS NO PORTAINER

No Stack → Environment:

```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

# 🌐 DEPLOY FINAL

Depois de subir o stack:

Você terá:

```
http://IP_DA_VPS:8010/health
```

Depois você liga no reverse proxy:

- Nginx Proxy Manager\
  ou
- Traefik (se já existir no Portainer)

Domínio sugerido:

```
instagram-analytics.seudominio.com
```

---

# ⚠️ REALIDADE IMPORTANTE (SEM FILTRO)

Instagram hoje:

- bloqueia scraping agressivo
- muda GraphQL frequentemente
- limita requests por IP

👉 Por isso o sistema PRECISA:

- fallback múltiplo
- cache
- jitter
- retry limitado

---

# ✅ O QUE EU FARIA NO SEU LUGAR AGORA

1. Subir stack no Portainer
2. Criar repo backend FastAPI
3. Implementar providers primeiro
4. Depois scheduler
5. Depois Supabase
6. Depois dashboard

---

# 🚀 SE QUISER PRÓXIMO PASSO

Posso te entregar agora:

✅ estrutura completa do repositório (pronta pra GitHub)\
✅ código FastAPI inteiro\
✅ provider GraphQL funcional\
✅ scraper sem login\
✅ migrations Supabase prontas\
✅ scheduler pronto\
✅ analytics pronto

Só me diga:

> “gera o backend completo”

e eu te entrego o sistema inteiro pronto pra colar no Portainer.
