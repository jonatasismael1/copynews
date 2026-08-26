# Protocolo de mudanças seguras do Copy News

Antes de qualquer melhoria:

1. Pesquisar código, migrations, funções, serviços e Vault.
2. Classificar cada item como `já existe`, `parcial` ou `lacuna`.
3. Alterar somente itens parciais ou lacunas comprovadas.
4. Criar teste específico e executar toda a suíte de regressão.
5. Aplicar schema antes do código que depende dele.
6. Publicar worker por imagem imutável e frontend somente com `npm run deploy:production`.
7. Validar banco, worker e interface em produção.
8. Registrar versão, resultado e rollback no Vault.

Uma recomendação genérica nunca é autorização para duplicar uma função existente.
