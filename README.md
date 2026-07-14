# Copy News

Central editorial mobile-first para capturar mídia social, transcrever, executar OCR, gerar copy com IA, revisar, registrar publicações e acompanhar métricas.

## Produção

- Aplicação: https://copynews.netlify.app
- Worker: https://copy-news-worker-production.up.railway.app/health
- Repositório: https://github.com/jonatasismael1/copynews

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

Validação: `npm run lint`, `npm run typecheck`, `npm test`, `npm test --prefix worker` e `npm run build`. Os scripts em `scripts/` cobrem RLS, Edge Functions, pipeline real, interface e limpeza de mídia; exigem variáveis de ambiente administrativas e nunca devem receber segredos versionados.

Consulte [arquitetura](docs/ARCHITECTURE.md), [deploy](docs/DEPLOY.md) e [segurança](docs/SECURITY.md).
