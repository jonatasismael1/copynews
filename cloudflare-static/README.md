# Copy News — Cloudflare e Contabo

Frontend: https://copynews.dbe.digital. APIs: https://copynews-api.dbe.digital. Supabase e worker de processamento existentes na Contabo são preservados, sem outra automação concorrente. Consulte ../infra/vps/PRODUCAO.md.

Esta pasta preserva os assets do deploy Netlify 6aba8cdf6571f10008ca07b7 por hash; a fonte original corresponde ao commit 0f7fe7683c07b1e6ddd2220d5d0bd45b73f35f88 na raiz deste mesmo repositório. Alterações locais não publicadas ficaram intactas. Nenhum dist local sem configuração foi usado.

Workers Builds publica esta pasta em main: npm ci --ignore-scripts && npm run check; deploy npx --no-install wrangler deploy. Atualizar assets somente após build de produção revisado com a configuração pública correta e validação do bundle. O check valida assets, limites, hostnames e os três testes de proxy. A API VPS usa os três handlers originais e quatro testes sintéticos antes de publicar pelo timer do GitHub.

Somente rotas de API/callback invocam o Worker; os assets têm atendimento direto. As rotas dinâmicas compartilham a franquia Worker Free, sem plano pago novo. O redirect_uri Meta antigo deve continuar acessível por redirecionamento estático enquanto o cadastro externo e a Edge Function não forem alterados coordenadamente. Não retirar a origem por iniciativa própria.

Rollback: reverter commit e conferir build/SHA; restaurar a imagem anterior das APIs ou o deploy Netlify original, conforme o componente afetado. Preservar bancos, volumes, secrets e worker existente.
