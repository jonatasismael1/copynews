# Copy News - Cloudflare e Contabo

Frontend: https://copynews.dbe.digital; alternativa HTTPS durante cache DNS antigo: https://dbe-copynews.jonatas-ismael25.workers.dev. API: https://copynews-api.dbe.digital. Supabase e worker existentes na Contabo preservados.

Assets recompilados da fonte deste repositorio com configuracao publica validada. Nao sao mais somente o snapshot Netlify inicial. Trabalho local anterior do usuario preservado.

GitHub main -> Workers Builds nativo, raiz /cloudflare-static: npm ci --ignore-scripts && npm run check; npx --no-install wrangler deploy. Atualizar fonte exige build e sincronizacao dos assets. Token CI por referencia gerenciada Cloudflare, sem copiar OAuth/token para arquivos ou GitHub. Confirmar sucesso por SHA e push_event.

API publica pelo timer dbe-copynews-api-deploy.timer com um unico handler ativo: instagram-media-proxy. Login Meta/Instagram e callback retornam 410 por decisao do usuario. Captura publica, IA, OCR e processamento existentes preservados. Nao reativar OAuth durante rollback sem nova decisao.

HTTP -> HTTPS; run_worker_first=true cobre workers.dev e faz todas essas requisicoes compartilharem a franquia Workers Free. Nao prometer trafego ilimitado. Cache local antigo nao equivale a falha do certificado Cloudflare.

Original Netlify 6aba8cdf6571f10008ca07b7 preservado como rollback. Compatibilidade temporaria: redirect estatico 307 para workers.dev, sem Functions/schedules, apos testar destino. Recuperacao por revert+build confirmado, imagem anterior da API ou restore explicito do deploy original; preservar dados e worker existente.
