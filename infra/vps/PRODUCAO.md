# Copy News — APIs na Contabo

Classificação: frontend e três proxies HTTP existiam na Netlify; worker de processamento e Supabase já estavam na Contabo. A migração reutiliza esses serviços. Não cria outro worker, cron ou automação e não modifica dados ou regras de negócio.

Frontend: https://copynews.dbe.digital, Cloudflare Static Assets; GitHub Workers Builds em /cloudflare-static. APIs: https://copynews-api.dbe.digital, serviço dbe-copynews-api_runtime, 0,5 CPU/256 MiB, usuário 1000, filesystem somente leitura, sem docker.sock/porta extra, Docker Secrets. São os três handlers originais do commit 0f7fe7683c07b1e6ddd2220d5d0bd45b73f35f88, com adaptação do contrato V1 pelo servidor Node. Não há chave administrativa Supabase no serviço.

O Worker da Cloudflare invoca código somente nas três rotas de API e no callback Instagram. Assets têm atendimento direto. API proxy usa destino VPS fixo e preserva método, corpo, query e autorização. Respostas de redirect do domínio Netlify antigo são traduzidas para o domínio atual. O limite Worker Free de requisições dinâmicas se aplica a esses caminhos; não há assinatura paga nova.

O redirect_uri cadastrado no Instagram continua https://copynews.netlify.app/auth/instagram/callback; a API Edge original do Supabase exige esse endereço também na troca do token. O domínio antigo deve manter um redirect estático 307 para o atual, sem Functions, após validação do handoff. Isso preserva OAuth sem mudança de regras e mantém uma dependência residual de URL na Netlify. Remover essa última dependência requer atualizar de forma coordenada o cadastro Meta e a configuração/validação da Edge Function; não eliminar o projeto antigo por iniciativa própria.

Deploy das APIs: dbe-copynews-api-deploy.timer lê main com deploy key exclusiva somente leitura, constrói a imagem fixada e executa quatro testes sintéticos antes de trocar apenas o serviço de API. Confere SHA e saúde, preserva imagem anterior e faz rollback se falhar; uma falha no mesmo commit tem espera mínima de 15 minutos antes de nova tentativa. Mudanças no controlador privilegiado precisam ser revisadas/instaladas pelo operador, não pelo próprio pipeline.

Atualizações do frontend precisam preservar a configuração pública Supabase correta. A pasta cloudflare-static/public contém o artefato original validado por hash, com aliases de caixa preservados. Não publicar dist local sem validação; não incluir .env, tokens ou service-role key no Git.

Rollback: desabilitar a promoção afetada, restaurar imagem anterior de API ou reverter o commit Cloudflare e conferir o SHA. Para retorno integral, restaurar o deploy Netlify 6aba8cdf6571f10008ca07b7 pela API; o worker existente não precisa ser reiniciado. Backups de configuração/variáveis ficam somente em DPAPI no Windows, com verificação de descriptografia, e exigem o mesmo usuário/chave.
