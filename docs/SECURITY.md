# Checklist de segurança

- RLS habilitado em todas as tabelas expostas.
- Perfis inativos são negados nas políticas.
- Papel administrativo vem de `profiles`/`app_metadata`, nunca de `user_metadata`.
- Secret key, OpenRouter e Cobalt ficam somente no backend.
- Bucket `temporary-media` é privado e limitado a 100 MB/MIME permitido.
- Downloads usam URLs assinadas de até 15 minutos.
- URLs de entrada aceitam somente HTTP(S) e rejeitam hosts locais.
- Alterações editoriais e administrativas geram histórico/auditoria.
- IA usa saída estruturada; divergências geram alertas para revisão humana.
