# Prompt de execução — Copy News

Leia integralmente o arquivo `copy-news-prd-v2.md` antes de alterar ou criar qualquer código.

Sua tarefa é implementar o **Copy News** conforme o PRD, como uma aplicação separada, mobile-first, pronta para uso interno e com arquitetura preparada para expansão.

## Contexto obrigatório

Já existe uma infraestrutura funcional do Cobalt usada em outro projeto. Não reimplemente o Cobalt e não acople o Copy News ao banco ou ao código do outro aplicativo.

Consuma o Cobalt como um serviço externo por meio de `COBALT_API_URL` e, quando necessário, `COBALT_API_KEY`.

O Cobalt deve ser tratado como responsável pela obtenção da mídia. Não presuma que ele fornece legenda, título ou todos os metadados da publicação. Crie um adaptador separado para metadados e utilize OCR + transcrição como fallback.

## Stack obrigatória

- React;
- Vite;
- TypeScript;
- Tailwind CSS;
- shadcn/ui;
- Lucide Icons;
- TanStack Query;
- React Hook Form;
- Zod;
- Supabase Auth;
- Supabase PostgreSQL;
- Supabase Storage apenas para arquivos temporários;
- Row Level Security em todas as tabelas expostas;
- OpenRouter para IA;
- serviço de transcrição já definido no ambiente;
- OCR implementado de forma modular.

Use versões estáveis e compatíveis das dependências.

## Diretrizes de implementação

1. Analise primeiro o repositório e documente brevemente o estado atual.
2. Crie um plano de implementação dividido por etapas.
3. Não apague funcionalidades existentes sem necessidade.
4. Não use dados mockados na entrega final.
5. Não exponha chaves privadas no frontend.
6. Nunca utilize `SUPABASE_SERVICE_ROLE_KEY` no navegador.
7. Execute criação e administração de usuários somente no backend seguro.
8. Crie migrations SQL versionadas.
9. Crie políticas RLS específicas por função.
10. Valide entradas no frontend e no backend.
11. Modele separadamente `news_items` e `publications`.
12. Modele métricas em `metric_snapshots`, preservando o histórico.
13. Use `America/Maceio` para contagens e datas operacionais.
14. Implemente jobs persistentes para tarefas demoradas.
15. Permita retomar etapas com falha sem descartar resultados já concluídos.
16. Use URLs assinadas e retenção temporária para mídia.
17. Implemente limpeza automática de arquivos expirados.
18. Registre alterações de status, versões de texto e ações administrativas.
19. Use respostas estruturadas da IA e valide o JSON com Zod.
20. Não permita que a IA substitua título ou legenda sem confirmação do usuário.

## Ordem recomendada

### Etapa 1 — Fundação

- configurar projeto;
- configurar Supabase;
- criar migrations;
- criar perfis e papéis;
- implementar autenticação por e-mail e senha;
- remover qualquer cadastro público;
- criar painel administrativo de usuários;
- implementar RLS;
- criar layout responsivo.

### Etapa 2 — Modelo editorial

- criar `news_items`;
- criar status editoriais;
- criar atribuição de responsáveis;
- criar histórico de status;
- criar versões de título e legenda;
- criar lista, filtros e Kanban.

### Etapa 3 — Processamento

- validar URL;
- integrar com Cobalt;
- criar mídia temporária;
- extrair áudio;
- transcrever;
- capturar frames;
- executar OCR;
- tentar obter metadados por adaptador;
- consolidar fontes;
- gerar título e legenda;
- salvar o resultado;
- permitir download do vídeo.

### Etapa 4 — Edição

- campos editáveis;
- autosave;
- copiar;
- gerar novamente;
- drawer “Alterar com IA”;
- prévia da nova versão;
- confirmar substituição;
- salvar versão anterior.

### Etapa 5 — Publicações

- criar tabela e telas de publicações;
- permitir publicação vinculada;
- permitir publicação externa;
- registrar link final;
- registrar página, plataforma, responsável e data;
- atualizar corretamente o contador diário.

### Etapa 6 — Métricas manuais

- criar snapshots;
- permitir atualização manual;
- exibir valor atual;
- exibir histórico;
- calcular variação;
- deixar `source=manual`;
- preparar adaptadores para `source=api`.

### Etapa 7 — Dashboard

- indicadores do dia;
- filtros por período;
- produção por usuário;
- publicação por página;
- metas;
- ranking;
- top publicações;
- cálculos consistentes com a tabela `publications`.

### Etapa 8 — Qualidade

- testes unitários;
- testes de integração;
- testes ponta a ponta;
- tratamento de erros;
- logs;
- empty states;
- responsividade;
- acessibilidade;
- documentação;
- `.env.example`;
- instruções de deploy.

## Requisitos visuais

A interface deve ser moderna, limpa e premium, sem excesso de elementos.

No mobile:

- priorize ações principais;
- use drawers para edições;
- mantenha botões de copiar e baixar facilmente acessíveis;
- evite tabelas largas;
- converta listas em cards quando necessário;
- use navegação inferior ou menu adaptado.

No desktop:

- use sidebar recolhível;
- aproveite melhor o espaço;
- permita lista e Kanban;
- use painéis laterais para detalhes.

Inclua:

- skeletons;
- toasts;
- estados vazios;
- confirmação de exclusão;
- feedback de cópia;
- indicador de salvamento;
- progresso verdadeiro do processamento;
- mensagens claras de erro.

## Regras críticas

- uma notícia pode ter várias publicações;
- uma publicação pode não estar vinculada a uma notícia;
- métricas pertencem à publicação;
- cada atualização cria um snapshot;
- o status `published` não substitui o registro da publicação;
- o total publicado no dia deve contar `publications.published_at`;
- não contar apenas notícias com status `published`;
- não guardar vídeos permanentemente;
- não usar scraping de métricas como solução principal;
- deixar a integração automática de métricas preparada, mas não bloquear o MVP por ela.

## Integração automática futura

Não implemente a integração da Meta nesta primeira entrega, a menos que toda a Fase 1 esteja concluída e testada.

Entretanto, prepare:

- `connected_accounts`;
- `external_account_id`;
- `external_media_id`;
- tokens criptografados;
- adaptadores por plataforma;
- `source=api`;
- rotina de sincronização;
- estados de conexão e erro.

## Critério de conclusão

Não considere o trabalho concluído apenas porque as telas existem.

Antes de finalizar:

1. execute migrations;
2. teste RLS com cada papel;
3. teste criação de usuário;
4. teste processamento real com Cobalt;
5. teste transcrição e OCR;
6. teste resposta inválida da IA;
7. teste edição com IA;
8. teste publicação vinculada;
9. teste publicação externa;
10. teste snapshots de métricas;
11. confira a contagem no fuso `America/Maceio`;
12. teste no celular;
13. confirme a exclusão automática da mídia;
14. rode lint, typecheck, testes e build;
15. corrija os erros encontrados;
16. entregue um resumo objetivo do que foi implementado, pendências reais e instruções de execução.

Quando uma decisão não estiver detalhada no PRD, escolha a alternativa mais simples, segura e sustentável, sem aumentar o escopo desnecessariamente.
