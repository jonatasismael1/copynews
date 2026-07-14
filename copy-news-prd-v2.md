# Copy News — PRD de Produto

**Versão:** 2.0  
**Tipo:** ferramenta web interna de produção e gestão editorial  
**Prioridade:** mobile-first  
**Idioma inicial:** português do Brasil  
**Fuso horário operacional:** `America/Maceio`

---

## 1. Visão geral

O **Copy News** é uma ferramenta interna para acelerar a produção, revisão, publicação e acompanhamento de notícias para redes sociais.

O sistema deverá receber o link de uma publicação de origem, baixar temporariamente o vídeo por meio da infraestrutura já existente do Cobalt, extrair as informações disponíveis e gerar um novo título e uma nova legenda com IA.

Além da geração de conteúdo, o Copy News deverá funcionar como um painel editorial, permitindo:

- criar e gerenciar usuários;
- atribuir responsáveis;
- controlar o status de cada notícia;
- registrar publicações feitas dentro ou fora do sistema;
- contabilizar quantas publicações foram feitas por dia;
- guardar o link da publicação final;
- registrar métricas manualmente no MVP;
- preparar a estrutura para sincronização automática de métricas no futuro;
- acompanhar produtividade e desempenho em dashboards.

O sistema é de uso próprio e não terá cadastro público.

---

## 2. Problema atual

O fluxo atual exige várias tarefas manuais:

1. copiar o link de uma publicação;
2. acessar um site externo para baixar o vídeo;
3. tirar prints para copiar textos exibidos no vídeo;
4. copiar ou capturar a legenda original;
5. transcrever o que foi falado;
6. enviar o material para uma IA;
7. pedir uma nova versão do título e da legenda;
8. baixar o vídeo;
9. publicar manualmente;
10. controlar separadamente quantas notícias foram publicadas;
11. acompanhar links e métricas sem uma central única.

Esse processo é lento, fragmentado e dificulta o acompanhamento da produção diária.

---

## 3. Objetivos

### 3.1 Objetivo principal

Centralizar em um único sistema o fluxo de:

**captura → geração → revisão → aprovação → agendamento → publicação → acompanhamento.**

### 3.2 Resultados esperados

- reduzir o tempo de preparação de cada notícia;
- eliminar a necessidade de copiar textos por print;
- organizar o trabalho entre usuários;
- saber quantas notícias foram produzidas e publicadas;
- identificar o responsável por cada etapa;
- registrar publicações que não foram geradas no Copy News;
- acompanhar o desempenho de cada publicação;
- manter rastreabilidade entre a fonte original e a publicação final.

---

## 4. Princípios do produto

1. **Simplicidade:** o fluxo principal deve exigir poucos cliques.
2. **Mobile-first:** o sistema será usado principalmente pelo celular.
3. **Sem armazenamento permanente de vídeos:** arquivos de mídia serão temporários.
4. **Preservação dos fatos:** a IA pode reescrever, mas não inventar informações.
5. **Rastreabilidade:** toda notícia deve manter origem, responsável, histórico e publicação final.
6. **Separação entre conteúdo e publicação:** uma notícia pode gerar várias publicações, cada uma com link e métricas próprios.
7. **Permissões claras:** cada perfil terá acesso apenas ao necessário.
8. **Uso responsável:** o usuário deverá confirmar que possui autorização para utilizar o material e manter os créditos quando aplicável.

---

## 5. Escopo por fase

## 5.1 Fase 1 — MVP obrigatório

- autenticação por e-mail e senha com Supabase;
- criação e gerenciamento de usuários pelo administrador;
- perfis de acesso;
- campo para colar o link de origem;
- integração com o Cobalt existente;
- download temporário do vídeo;
- botão para baixar o vídeo no aparelho;
- extração de áudio;
- transcrição;
- OCR de textos exibidos no vídeo;
- tentativa de obtenção da legenda original por um adaptador próprio de metadados;
- geração de título e legenda com IA;
- edição manual;
- edição orientada por IA;
- histórico de notícias;
- responsáveis;
- status editoriais;
- registro do link final publicado;
- cadastro de publicações externas que não foram geradas no sistema;
- métricas manuais;
- dashboard diário, semanal e mensal;
- pesquisa e filtros;
- trilha de alterações;
- exclusão automática dos arquivos temporários.

## 5.2 Fase 2 — integração automática de métricas

- conexão de contas profissionais do Instagram/Meta;
- autorização da conta por OAuth;
- sincronização automática das métricas permitidas pela API;
- armazenamento de snapshots de métricas;
- atualização agendada;
- indicadores de crescimento;
- comparação de desempenho entre páginas, usuários e categorias.

## 5.3 Fora do escopo inicial

- publicação automática nas redes sociais;
- agendamento automático diretamente no Instagram ou Facebook;
- scraping não autorizado de métricas;
- armazenamento permanente da biblioteca de vídeos;
- cadastro público de usuários;
- cobrança, assinaturas ou planos;
- aplicativo nativo para Android ou iOS.

---

## 6. Perfis de usuário

## 6.1 Administrador

Pode:

- criar, editar, ativar e desativar usuários;
- redefinir senha ou iniciar fluxo de recuperação;
- alterar função e permissões;
- visualizar todas as notícias e publicações;
- editar qualquer registro;
- excluir ou arquivar registros;
- visualizar dashboards completos;
- gerenciar configurações;
- cadastrar e editar métricas;
- configurar integrações futuras;
- visualizar o histórico de alterações.

## 6.2 Editor

Pode:

- criar notícias;
- editar títulos e legendas;
- usar a IA;
- atribuir responsáveis;
- alterar status;
- aprovar ou rejeitar conteúdos;
- cadastrar publicações;
- registrar métricas;
- visualizar dashboards e relatórios.

## 6.3 Redator

Pode:

- criar notícias;
- processar links;
- editar os próprios conteúdos;
- usar a IA;
- enviar para aprovação;
- visualizar os conteúdos atribuídos a ele;
- registrar uma publicação quando essa permissão estiver habilitada.

## 6.4 Visualizador

Pode:

- visualizar notícias, publicações, métricas e dashboards;
- não pode criar, editar ou excluir.

---

## 7. Autenticação e usuários

### 7.1 Autenticação

Usar Supabase Auth com:

- e-mail;
- senha;
- sessão persistente;
- recuperação de senha;
- logout;
- bloqueio de acesso para usuários inativos.

Não usar:

- Google;
- Apple;
- Facebook;
- cadastro público;
- login anônimo.

### 7.2 Criação de usuários

A criação de usuários deverá acontecer somente por um administrador autenticado.

A operação administrativa deverá ser executada no backend, por Edge Function ou servidor seguro. A chave `service_role` nunca poderá ser enviada ao navegador.

### 7.3 Perfil

Cada usuário terá:

- nome;
- e-mail;
- função;
- avatar opcional;
- status ativo/inativo;
- data de criação;
- último acesso;
- meta diária opcional de publicações.

---

## 8. Conceitos principais do banco

### 8.1 Notícia

É o conteúdo editorial em produção.

Contém:

- link de origem;
- vídeo temporário;
- transcrição;
- textos detectados por OCR;
- legenda original, quando disponível;
- título gerado;
- legenda gerada;
- responsável;
- status editorial;
- histórico.

### 8.2 Publicação

É o registro de uma postagem efetivamente realizada em uma rede social ou portal.

Uma notícia poderá ter nenhuma, uma ou várias publicações.

Exemplo:

- a mesma notícia foi publicada no Instagram da Página A;
- também foi publicada no Facebook;
- cada publicação possui um link e métricas diferentes.

Uma publicação também poderá ser cadastrada sem estar vinculada a uma notícia gerada pelo Copy News.

### 8.3 Snapshot de métricas

É uma fotografia das métricas de uma publicação em determinado momento.

Essa separação permite acompanhar evolução, e não apenas o valor mais recente.

---

## 9. Fluxos principais

## 9.1 Gerar uma notícia a partir de um link

1. Usuário acessa a tela inicial.
2. Cola o link da publicação de origem.
3. Seleciona, opcionalmente:
   - responsável;
   - categoria;
   - página de destino;
   - tom editorial.
4. Clica em **Processar notícia**.
5. O backend valida o link.
6. O Cobalt recebe a URL e retorna a mídia ou uma URL temporária.
7. O sistema extrai o áudio.
8. O sistema executa a transcrição.
9. O sistema captura frames estratégicos e executa OCR.
10. Um adaptador de metadados tenta obter a legenda original.
11. O sistema consolida todas as fontes.
12. A IA gera o título e a legenda.
13. O resultado é salvo como rascunho.
14. O usuário revisa, edita, copia ou envia para aprovação.
15. O usuário pode baixar o vídeo no aparelho.

### Regra importante

Não assumir que o Cobalt fornece legenda, título ou metadados da publicação. O Cobalt será responsável pela obtenção da mídia. A coleta de legenda e metadados deverá ficar em um módulo separado, com fallback para OCR e transcrição.

---

## 9.2 Editar com IA

Nos blocos de **Título** e **Legenda**, exibir:

- Copiar;
- Gerar novamente;
- Alterar com IA.

Ao tocar em **Alterar com IA**, abrir um drawer.

Texto de orientação:

> Diga o que deseja mudar. A IA criará uma nova versão apenas deste campo, sem alterar o restante da notícia.

Sugestões rápidas:

- deixe mais jornalístico;
- deixe mais curto;
- destaque o fato principal;
- retire opiniões;
- simplifique a linguagem;
- mantenha os fatos e mude a estrutura;
- crie uma versão mais adequada para Instagram.

Fluxo:

1. usuário envia uma instrução;
2. IA gera uma prévia;
3. usuário escolhe:
   - substituir o texto atual;
   - tentar novamente;
   - cancelar;
4. a versão anterior deve continuar registrada no histórico.

A IA não deverá substituir automaticamente o conteúdo sem confirmação do usuário.

---

## 9.3 Alterar status editorial

O usuário autorizado poderá mudar o status pela tela da notícia, pela lista ou pelo Kanban.

Status:

1. `processing` — processando;
2. `draft` — rascunho;
3. `awaiting_approval` — aguardando aprovação;
4. `changes_requested` — ajustes solicitados;
5. `approved` — aprovado;
6. `scheduled` — agendado;
7. `published` — publicado;
8. `cancelled` — cancelado;
9. `archived` — arquivado;
10. `failed` — falha no processamento.

### Regras de transição

- uma notícia processada com sucesso entra como `draft`;
- um redator pode enviar `draft` para `awaiting_approval`;
- editor ou administrador pode aprovar, solicitar ajustes ou cancelar;
- `scheduled` exige data e hora previstas;
- `published` exige ao menos uma publicação cadastrada ou confirmação explícita de publicação sem link;
- ao cadastrar a primeira publicação vinculada, o sistema deve sugerir mudar a notícia para `published`;
- `archived` não entra nas contagens operacionais por padrão;
- toda alteração deverá registrar usuário, data, status anterior e novo status.

---

## 9.4 Registrar uma publicação vinculada

1. Usuário abre uma notícia.
2. Clica em **Registrar publicação**.
3. Informa:
   - rede/plataforma;
   - página ou perfil;
   - link da publicação;
   - data e hora;
   - responsável pela postagem;
   - créditos utilizados;
   - observação opcional.
4. O sistema cria a publicação.
5. O contador diário é atualizado.
6. O sistema sugere alterar o status da notícia para `published`.
7. O usuário pode adicionar métricas manualmente.

---

## 9.5 Registrar publicação externa

O sistema terá uma aba **Publicações** com o botão **Adicionar publicação**.

Esse fluxo serve para conteúdos que foram publicados, mas não foram gerados no Copy News.

Campos:

- título ou identificação;
- legenda opcional;
- rede/plataforma;
- página ou perfil;
- link publicado;
- data e hora;
- responsável;
- categoria;
- créditos;
- métricas iniciais;
- observação.

A publicação ficará com `news_item_id` nulo e contará normalmente nos dashboards.

---

## 9.6 Atualizar métricas manualmente

Na publicação, o usuário poderá registrar:

- visualizações ou reproduções;
- alcance;
- impressões;
- curtidas;
- comentários;
- compartilhamentos;
- salvamentos;
- cliques;
- seguidores ganhos, quando conhecido;
- data e hora da coleta.

O sistema deverá guardar um novo snapshot, sem sobrescrever silenciosamente o histórico anterior.

Também deverá mostrar:

- valor atual;
- variação desde a última coleta;
- data da última atualização;
- origem: `manual` ou `api`.

---

## 9.7 Sincronizar métricas automaticamente — Fase 2

A integração automática deverá ser implementada por adaptadores de plataforma.

Para Instagram/Meta:

- conectar apenas contas profissionais suportadas;
- criar e configurar um aplicativo na plataforma Meta;
- executar autorização da conta;
- armazenar tokens de forma segura;
- renovar tokens quando aplicável;
- associar a conta conectada a uma página/perfil interno;
- buscar somente métricas permitidas para a conta e para o tipo de mídia;
- registrar os valores em `metric_snapshots`;
- informar claramente quando uma métrica não estiver disponível.

### Limitação obrigatória

Colar apenas um link público não é garantia de acesso automático a métricas completas. Insights dependem de conta conectada, permissões, tipo de mídia, propriedade do conteúdo e regras atuais da plataforma.

Não implementar scraping como solução principal.

---

## 10. Módulos e telas

## 10.1 Login

- logomarca Copy News;
- e-mail;
- senha;
- entrar;
- esqueci minha senha;
- sem botão de cadastro.

## 10.2 Dashboard

### Cards do dia

- notícias criadas;
- aguardando aprovação;
- aprovadas;
- agendadas;
- publicadas;
- publicações externas;
- meta diária;
- percentual da meta atingida.

### Períodos

- hoje;
- ontem;
- últimos 7 dias;
- este mês;
- intervalo personalizado.

### Indicadores

- publicações por dia;
- publicações por usuário;
- notícias por status;
- notícias por categoria;
- notícias por página;
- média diária;
- quantidade produzida versus publicada;
- ranking de desempenho;
- top publicações por visualizações;
- top publicações por comentários;
- top publicações por engajamento.

### Regra de contagem diária

A contagem de “publicadas no dia” será baseada em `published_at`, usando o fuso `America/Maceio`, e contará registros da tabela `publications`, não apenas notícias com status `published`.

Isso evita contar uma notícia apenas uma vez quando ela foi publicada em várias páginas.

## 10.3 Criar notícia

- campo de URL;
- plataforma detectada automaticamente;
- responsável;
- página de destino opcional;
- categoria;
- observações;
- botão Processar notícia.

## 10.4 Processamento

Exibir progresso real ou estado conhecido:

- validando link;
- obtendo mídia;
- preparando áudio;
- transcrevendo;
- lendo textos do vídeo;
- buscando metadados;
- gerando conteúdo;
- salvando resultado.

Não exibir etapas como concluídas antes da confirmação do backend.

Em caso de erro:

- informar em qual etapa ocorreu;
- permitir tentar novamente apenas a etapa que falhou;
- manter os resultados já obtidos;
- registrar log técnico.

## 10.5 Resultado da notícia

### Vídeo

- preview;
- botão Baixar vídeo;
- indicador de expiração do arquivo temporário;
- botão Reprocessar mídia, se necessário.

### Título

- campo editável;
- copiar;
- gerar novamente;
- alterar com IA;
- salvar.

### Legenda

- campo editável;
- copiar;
- gerar novamente;
- alterar com IA;
- salvar.

### Informações de apoio

- legenda original;
- transcrição;
- OCR;
- link de origem;
- créditos;
- responsável;
- categoria;
- status;
- histórico.

Essas informações podem ficar em abas ou acordeões para não poluir a tela principal.

## 10.6 Quadro editorial

Oferecer duas visualizações:

- lista;
- Kanban.

Colunas do Kanban:

- Rascunho;
- Aguardando aprovação;
- Ajustes solicitados;
- Aprovado;
- Agendado;
- Publicado.

Itens cancelados, falhos e arquivados ficam disponíveis por filtros.

## 10.7 Histórico de notícias

Filtros:

- texto;
- link de origem;
- período;
- responsável;
- criador;
- status;
- categoria;
- plataforma de origem;
- página de destino;
- com ou sem publicação.

Ações:

- abrir;
- duplicar;
- alterar status;
- atribuir usuário;
- arquivar;
- excluir, conforme permissão.

## 10.8 Publicações

Lista unificada de todas as publicações:

- vinculadas a notícias;
- cadastradas manualmente.

Colunas principais:

- data;
- título;
- plataforma;
- página;
- responsável;
- link;
- origem do registro;
- última métrica;
- última atualização.

Ações:

- abrir link;
- editar;
- atualizar métricas;
- ver histórico;
- vincular a uma notícia;
- desvincular;
- arquivar.

## 10.9 Usuários

Disponível apenas para administradores.

- listar usuários;
- criar usuário;
- editar nome;
- editar função;
- ativar/desativar;
- redefinir acesso;
- definir meta diária;
- visualizar produtividade.

## 10.10 Configurações

- modelos de IA;
- prompt editorial padrão;
- categorias;
- páginas e perfis;
- plataformas;
- meta diária padrão;
- tempo de retenção dos arquivos;
- integração com Cobalt;
- integração com transcrição;
- integrações de métricas futuras.

---

## 11. Geração de conteúdo com IA

## 11.1 Fontes de contexto

A geração deverá considerar:

1. legenda original, quando obtida;
2. textos detectados por OCR;
3. transcrição do áudio;
4. instruções editoriais;
5. categoria;
6. observações do usuário.

A prioridade não deve significar confiança cega. Em caso de divergência entre fontes, a IA deverá:

- evitar afirmar o dado conflitante;
- sinalizar a inconsistência;
- pedir revisão humana no resultado;
- não completar informações por suposição.

## 11.2 Título

Deve ser:

- direto;
- claro;
- jornalístico;
- fiel aos fatos;
- sem clickbait enganoso;
- sem inventar nomes, números, lugares ou datas;
- preferencialmente curto.

## 11.3 Legenda

Deve:

- ser uma nova redação;
- reorganizar as informações;
- preservar fatos;
- eliminar repetições;
- evitar copiar frases completas da fonte;
- evitar opinião não solicitada;
- indicar incerteza quando a fonte também for incerta;
- não criar declarações ou citações inexistentes;
- manter espaço opcional para créditos.

## 11.4 Saída estruturada

A resposta da IA deverá usar JSON validado por schema:

```json
{
  "title": "string",
  "caption": "string",
  "summary": "string",
  "category_suggestion": "string|null",
  "detected_facts": [],
  "warnings": [],
  "confidence": "low|medium|high"
}
```

O backend deverá validar a resposta antes de salvar.

---

## 12. Processamento de mídia

## 12.1 Cobalt

Reutilizar a estrutura já existente.

O Copy News deverá consumir o Cobalt como serviço externo configurado por variável de ambiente.

Não duplicar o Cobalt dentro do projeto e não criar dependência direta do banco do Kooki.

## 12.2 Arquivos temporários

O vídeo poderá ser armazenado temporariamente apenas para:

- preview;
- download pelo usuário;
- extração de áudio;
- OCR;
- transcrição.

Regras:

- usar diretório ou bucket temporário;
- gerar nomes não previsíveis;
- limitar acesso por URL assinada;
- excluir automaticamente após o tempo configurado;
- não registrar o vídeo como biblioteca permanente;
- registrar somente metadados necessários;
- remover arquivos órfãos por rotina de limpeza;
- não enviar URLs internas sensíveis ao cliente.

## 12.3 OCR

- capturar frames por intervalo e por mudança de cena;
- evitar processar todos os frames;
- remover duplicidades;
- guardar texto consolidado;
- registrar confiança quando disponível;
- permitir correção manual.

## 12.4 Transcrição

- priorizar extração do áudio, evitando processar o vídeo completo quando não for necessário;
- armazenar transcrição textual;
- guardar idioma detectado;
- registrar duração e status;
- permitir reprocessamento.

---

## 13. Modelo de dados sugerido

## 13.1 `profiles`

- `id` UUID, FK para `auth.users`;
- `name`;
- `email`;
- `role`;
- `avatar_url`;
- `is_active`;
- `daily_goal`;
- `last_seen_at`;
- `created_at`;
- `updated_at`.

## 13.2 `pages`

Representa páginas, perfis ou canais administrados.

- `id`;
- `name`;
- `platform`;
- `username`;
- `external_account_id`;
- `is_active`;
- `created_at`;
- `updated_at`.

## 13.3 `categories`

- `id`;
- `name`;
- `slug`;
- `is_active`;
- `created_at`.

## 13.4 `news_items`

- `id`;
- `source_url`;
- `source_platform`;
- `source_author`;
- `source_caption`;
- `source_credit`;
- `temporary_media_path`;
- `temporary_media_expires_at`;
- `transcript`;
- `ocr_text`;
- `generated_title`;
- `generated_caption`;
- `summary`;
- `ai_confidence`;
- `ai_warnings` JSONB;
- `status`;
- `category_id`;
- `assigned_to`;
- `created_by`;
- `scheduled_at`;
- `approved_by`;
- `approved_at`;
- `created_at`;
- `updated_at`;
- `archived_at`.

## 13.5 `news_versions`

Registra versões de título e legenda.

- `id`;
- `news_item_id`;
- `field`;
- `previous_value`;
- `new_value`;
- `change_type`;
- `instruction`;
- `created_by`;
- `created_at`.

## 13.6 `status_history`

- `id`;
- `news_item_id`;
- `from_status`;
- `to_status`;
- `note`;
- `changed_by`;
- `created_at`.

## 13.7 `publications`

- `id`;
- `news_item_id` nullable;
- `title`;
- `caption`;
- `platform`;
- `page_id`;
- `published_url`;
- `external_media_id`;
- `published_at`;
- `posted_by`;
- `credit_text`;
- `source_type` (`copy_news` ou `external`);
- `notes`;
- `created_by`;
- `created_at`;
- `updated_at`;
- `archived_at`.

Criar índice único condicional para evitar duplicação do mesmo `published_url` quando não estiver vazio.

## 13.8 `metric_snapshots`

- `id`;
- `publication_id`;
- `captured_at`;
- `source` (`manual` ou `api`);
- `views`;
- `reach`;
- `impressions`;
- `likes`;
- `comments`;
- `shares`;
- `saves`;
- `clicks`;
- `followers_gained`;
- `raw_payload` JSONB;
- `created_by`;
- `created_at`.

## 13.9 `processing_jobs`

- `id`;
- `news_item_id`;
- `current_step`;
- `status`;
- `progress`;
- `attempts`;
- `error_code`;
- `error_message`;
- `started_at`;
- `finished_at`;
- `created_at`;
- `updated_at`.

## 13.10 `connected_accounts` — Fase 2

- `id`;
- `page_id`;
- `provider`;
- `provider_account_id`;
- `encrypted_access_token`;
- `token_expires_at`;
- `scopes`;
- `status`;
- `last_sync_at`;
- `created_at`;
- `updated_at`.

## 13.11 `audit_logs`

- `id`;
- `user_id`;
- `action`;
- `entity_type`;
- `entity_id`;
- `before_data` JSONB;
- `after_data` JSONB;
- `created_at`.

---

## 14. Segurança e permissões

- habilitar RLS em todas as tabelas expostas;
- negar acesso para usuários inativos;
- impedir acesso anônimo aos dados;
- usar `auth.uid()` nas políticas;
- proteger ações administrativas no backend;
- nunca expor `service_role`;
- validar URLs;
- limitar tamanho e duração dos arquivos;
- aplicar rate limit aos processamentos e chamadas de IA;
- validar MIME type real;
- higienizar textos renderizados;
- usar URLs assinadas para arquivos temporários;
- registrar ações administrativas;
- não armazenar tokens de plataformas em texto puro;
- separar variáveis públicas e privadas;
- impedir que um redator aprove o próprio conteúdo, caso essa regra seja habilitada.

### Matriz resumida

| Ação | Administrador | Editor | Redator | Visualizador |
|---|---:|---:|---:|---:|
| Criar notícia | Sim | Sim | Sim | Não |
| Editar qualquer notícia | Sim | Sim | Não | Não |
| Editar notícia própria/atribuída | Sim | Sim | Sim | Não |
| Aprovar | Sim | Sim | Não | Não |
| Registrar publicação | Sim | Sim | Configurável | Não |
| Atualizar métricas | Sim | Sim | Configurável | Não |
| Gerenciar usuários | Sim | Não | Não | Não |
| Ver dashboards | Sim | Sim | Limitado | Sim |
| Excluir definitivamente | Sim | Não | Não | Não |

---

## 15. Serviços e funções de backend

Implementar funções com responsabilidades separadas:

- `admin-create-user`;
- `admin-update-user`;
- `process-source-url`;
- `fetch-media-from-cobalt`;
- `extract-source-metadata`;
- `extract-audio`;
- `transcribe-audio`;
- `extract-video-text`;
- `generate-news-copy`;
- `revise-news-field`;
- `create-publication`;
- `record-metrics`;
- `cleanup-temporary-media`;
- `sync-publication-metrics` — Fase 2.

Operações demoradas deverão usar jobs e estados persistentes, evitando depender de uma única requisição longa do navegador.

A interface deverá poder consultar o estado do job e continuar mostrando o resultado mesmo após recarregar a página.

---

## 16. Dashboard e cálculos

## 16.1 Produção

- notícias criadas por usuário;
- notícias concluídas;
- notícias aguardando aprovação;
- tempo médio entre criação e aprovação;
- tempo médio entre aprovação e publicação;
- taxa de publicação.

## 16.2 Publicação

- total publicado por dia;
- total por página;
- total por plataforma;
- total por usuário;
- publicações externas versus geradas no Copy News;
- meta diária individual e geral.

## 16.3 Desempenho

- visualizações;
- alcance;
- interações;
- comentários;
- compartilhamentos;
- salvamentos;
- desempenho médio por categoria;
- desempenho médio por página;
- evolução entre snapshots.

### Engajamento

Não fixar uma única fórmula como verdade universal.

Permitir configurar ou exibir claramente a fórmula usada, por exemplo:

```text
interações = curtidas + comentários + compartilhamentos + salvamentos
```

Quando houver alcance:

```text
taxa de engajamento por alcance = interações / alcance × 100
```

Quando não houver alcance, não substituir silenciosamente por visualizações. Exibir a métrica como indisponível ou usar outra fórmula identificada.

---

## 17. Requisitos de experiência do usuário

- design minimalista e premium;
- navegação simples;
- sidebar recolhível no desktop;
- navegação inferior ou menu adequado no mobile;
- toasts para ações;
- confirmações para exclusões;
- skeletons durante carregamento;
- botões de copiar com feedback visual;
- drawers no mobile;
- modais somente quando fizerem sentido;
- autosave com indicador de estado;
- prevenção de perda de alterações;
- filtros persistentes durante a sessão;
- empty states úteis;
- acessibilidade básica;
- contraste adequado;
- alvos de toque confortáveis;
- sem telas sobrecarregadas.

---

## 18. Regras de negócio

1. Uma notícia pode existir sem publicação.
2. Uma publicação pode existir sem notícia vinculada.
3. Uma notícia pode ter várias publicações.
4. Contadores de publicações usam a tabela `publications`.
5. Métricas pertencem a uma publicação, não diretamente à notícia.
6. Cada atualização de métricas cria um snapshot.
7. O status `published` da notícia não substitui o registro da publicação.
8. Excluir uma notícia não deverá apagar publicações sem confirmação explícita.
9. Arquivamento deve ser preferido à exclusão definitiva.
10. Alterações por IA devem gerar versão.
11. Mudanças de status devem gerar histórico.
12. O vídeo temporário expirado não deverá impedir acesso ao título, legenda, transcrição ou histórico.
13. O sistema deve deduplicar links de origem e alertar o usuário, sem bloquear obrigatoriamente.
14. O sistema deve alertar sobre links de publicação duplicados.
15. Todos os horários operacionais devem respeitar `America/Maceio`.

---

## 19. Critérios de aceite do MVP

O MVP será considerado concluído quando:

1. um administrador conseguir criar usuários;
2. os usuários conseguirem entrar com e-mail e senha;
3. as permissões funcionarem conforme o perfil;
4. um link suportado puder ser enviado para processamento;
5. o sistema utilizar o Cobalt existente;
6. o vídeo puder ser baixado no celular;
7. o áudio puder ser transcrito;
8. textos visíveis puderem ser capturados por OCR;
9. o sistema gerar título e legenda;
10. título e legenda puderem ser editados manualmente;
11. o usuário puder pedir uma alteração específica à IA;
12. a IA mostrar uma prévia antes de substituir;
13. a notícia puder receber responsável e status;
14. o histórico registrar mudanças;
15. uma publicação vinculada puder ser cadastrada;
16. uma publicação externa puder ser cadastrada;
17. o dashboard contar corretamente as publicações do dia;
18. métricas manuais puderem ser registradas;
19. snapshots anteriores permanecerem consultáveis;
20. o sistema funcionar corretamente em celular e desktop;
21. arquivos temporários forem removidos automaticamente;
22. nenhuma chave privada estiver exposta no frontend;
23. RLS estiver habilitado e testado;
24. falhas de processamento puderem ser retomadas sem perder todas as etapas concluídas.

---

## 20. Testes obrigatórios

### Unitários

- validação de URLs;
- transições de status;
- cálculos do dashboard;
- cálculo de engajamento;
- validação do JSON da IA;
- verificação de permissões.

### Integração

- Supabase Auth;
- RLS;
- Cobalt;
- transcrição;
- OCR;
- IA;
- criação de publicação;
- snapshots de métricas;
- rotina de limpeza.

### Ponta a ponta

- login;
- geração de notícia;
- edição com IA;
- aprovação;
- registro de publicação;
- cadastro de publicação externa;
- atualização de métricas;
- dashboard;
- gerenciamento de usuários.

---

## 21. Variáveis de ambiente sugeridas

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_SERVICE_ROLE_KEY=

COBALT_API_URL=
COBALT_API_KEY=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

TRANSCRIPTION_API_URL=
TRANSCRIPTION_API_KEY=

TEMP_MEDIA_BUCKET=
TEMP_MEDIA_TTL_MINUTES=

APP_TIMEZONE=America/Maceio
```

Somente variáveis prefixadas corretamente para o frontend poderão ser expostas ao navegador.

---

## 22. Entrega técnica esperada

- aplicação funcional;
- migrations SQL versionadas;
- políticas RLS versionadas;
- seed opcional para categorias e perfis;
- `.env.example`;
- documentação de instalação;
- documentação da integração com Cobalt;
- documentação do fluxo de processamento;
- diagrama simples da arquitetura;
- testes;
- logs claros;
- instruções de deploy;
- checklist de segurança;
- sem dados mockados na versão final.

---

## 23. Arquitetura resumida

```text
Usuário
  ↓
Copy News — React/Vite
  ↓
Supabase Auth + PostgreSQL + RLS
  ↓
Job de processamento
  ├─ Cobalt → mídia temporária
  ├─ Extração de áudio
  ├─ Transcrição
  ├─ Frames + OCR
  ├─ Adaptador de metadados
  └─ OpenRouter → título e legenda
  ↓
Notícia editorial
  ↓
Aprovação / Agendamento
  ↓
Publicação registrada
  ↓
Snapshots de métricas
  ↓
Dashboard
```

---

## 24. Decisão recomendada para o MVP

Implementar inicialmente as métricas de forma manual, mas criar desde o começo:

- tabela de contas/páginas;
- tabela de publicações;
- tabela de snapshots;
- campo de origem da métrica;
- IDs externos opcionais;
- adaptadores de plataforma.

Essa abordagem entrega valor sem bloquear o projeto por aprovações e limitações de APIs, enquanto mantém o banco preparado para a automação futura.
