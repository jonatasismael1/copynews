# Regras críticas de produção

## Netlify

- Nunca publicar `dist` diretamente com `netlify deploy --dir=dist --prod --no-build`.
- O frontend depende de `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente do Netlify.
- Todo deploy deve usar `npm run deploy:production`. Esse comando constrói com as variáveis do Netlify e valida o bundle antes da publicação.
- Depois do deploy, abrir `https://copynews.netlify.app` e confirmar que a tela “Ambiente não configurado” não aparece.
- Se o build ou a validação falhar, manter/restaurar o último deploy saudável. Não publicar o artefato local.

## Prevenção de trabalho duplicado e regressões

- Antes de propor ou implementar melhoria, registrar a classificação: `já existe`, `existe parcialmente` ou `lacuna comprovada`.
- Não recriar auditoria, retenção, health check, processamento em segundo plano ou alertas sem primeiro localizar e testar a implementação existente.
- Alterações devem ser incrementais, ter teste de não regressão e preservar o último artefato saudável para rollback.
- Nunca considerar uma funcionalidade concluída apenas porque existe código: confirmar schema aplicado, serviço ativo e resultado real em produção.
