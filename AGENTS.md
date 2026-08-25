# Regras críticas de produção

## Netlify

- Nunca publicar `dist` diretamente com `netlify deploy --dir=dist --prod --no-build`.
- O frontend depende de `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente do Netlify.
- Todo deploy deve usar `npm run deploy:production`. Esse comando constrói com as variáveis do Netlify e valida o bundle antes da publicação.
- Depois do deploy, abrir `https://copynews.netlify.app` e confirmar que a tela “Ambiente não configurado” não aparece.
- Se o build ou a validação falhar, manter/restaurar o último deploy saudável. Não publicar o artefato local.
