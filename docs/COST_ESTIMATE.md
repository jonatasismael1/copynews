# Estimativa mensal de custos

Atualizada em 14 de julho de 2026. Valores em USD, antes de impostos e câmbio.

## Premissas

- 15 publicações por usuário por dia, durante 30 dias: 450 publicações por usuário/mês.
- Vídeo médio de 60 segundos. Posts estáticos sem áudio custam menos.
- Até oito quadros por publicação para leitura visual/OCR.
- Aproximadamente 2.000 tokens de entrada e 600 de saída para título e legenda.
- Aproximadamente 8.000 tokens visuais de entrada e 400 de saída para OCR.
- Produção atual: `openai/gpt-4.1-mini` para texto e visão e `openai/whisper-large-v3` para transcrição.
- OpenRouter: GPT-4.1 mini a US$ 0,40/M tokens de entrada e US$ 1,60/M de saída; Whisper Large V3 a US$ 0,0015/minuto.
- Railway: dois serviços, worker e Cobalt, no Hobby, com cobrança por uso e mínimo mensal de US$ 5.

## Produção atual

| Usuários | Posts/mês | Créditos OpenRouter consumidos | Caixa estimado do OpenRouter com taxa | Railway esperado | Total com Supabase e Netlify gratuitos |
|---:|---:|---:|---:|---:|---:|
| 1 | 450 | US$ 3,20 | US$ 3,71* | US$ 6 | US$ 9,71 |
| 5 | 2.250 | US$ 15,98 | US$ 16,86 | US$ 10 | US$ 26,86 |
| 10 | 4.500 | US$ 31,95 | US$ 33,71 | US$ 16 | US$ 49,71 |

\* A recarga mínima é de US$ 5 e a taxa mínima é de US$ 0,80. Na prática, a primeira compra custa US$ 5,80 e o saldo não é consumido em um único mês com um usuário. O valor da tabela rateia esse saldo. O OpenRouter cobra 5,5% na compra de créditos, com mínimo de US$ 0,80.

Faixas prudentes para Railway: US$ 5–8 com 1 usuário, US$ 7–14 com 5 e US$ 10–24 com 10. A diferença depende principalmente de RAM ociosa, tamanho dos vídeos, tráfego de mídia e concentração dos envios no mesmo horário. A CPU de FFmpeg/OCR também cresce com duração e resolução.

Se o vídeo médio tiver dois minutos, acrescente aproximadamente US$ 0,68, US$ 3,38 e US$ 6,75 de transcrição aos cenários de 1, 5 e 10 usuários, além de algum uso extra de Railway.

## Comparativo de modelos

Estimativa total de inferência por mês, incluindo transcrição de um minuto, geração e OCR:

| Estratégia | 1 usuário | 5 usuários | 10 usuários | Avaliação editorial |
|---|---:|---:|---:|---|
| GPT-4.1 mini em texto e visão + Whisper V3 | US$ 3,20 | US$ 15,98 | US$ 31,95 | Melhor equilíbrio atual de fidelidade, instruções e custo |
| GPT-4.1 mini no texto + Gemini 2.5 Flash Lite no OCR + Whisper V3 | US$ 1,90 | US$ 9,49 | US$ 18,99 | Recomendação de economia sem trocar o redator |
| GPT-4o mini em texto e visão + Whisper V3 | US$ 1,62 | US$ 8,10 | US$ 16,20 | Econômico, mas tende a resumir e omitir detalhes com mais facilidade |
| Gemini 2.5 Flash Lite em tudo + Whisper V3 | US$ 1,30 | US$ 6,52 | US$ 13,05 | Muito barato; adequado para OCR, menos seguro como redator final |
| Gemini 2.5 Flash em texto e visão + Whisper V3 | US$ 3,15 | US$ 15,75 | US$ 31,50 | Custo semelhante ao atual; pode reformular mais quando o raciocínio está ativo |
| Claude Haiku 4.5 em texto e visão + Whisper V3 | US$ 7,43 | US$ 37,13 | US$ 74,25 | Boa escrita, mas caro demais para o ganho esperado neste fluxo |

Recomendação: manter o GPT-4.1 mini para título e legenda, com temperatura baixa e resposta estruturada. Ele deve consolidar as fontes sem “melhorar” fatos. Se for necessário reduzir custo, trocar somente o modelo de visão/OCR por Gemini 2.5 Flash Lite e validar com um lote de 50 publicações reais. Isso reduz a inferência estimada em cerca de 41% preservando o redator atual.

Para transcrição, manter Whisper Large V3. O Whisper Large V3 Turbo custa cerca de US$ 0,04/hora, contra US$ 0,09/hora do V3, mas a economia seria apenas US$ 0,38 por usuário/mês neste cenário. Para jornalismo, nomes próprios, endereços e áudio de rua justificam o pequeno custo adicional do V3 completo.

## Supabase e Netlify pagos

- Supabase Pro: US$ 25/mês para o primeiro projeto, dentro das cotas incluídas.
- Netlify Personal: US$ 9/mês; suficiente para operação individual.
- Netlify Pro: US$ 20/mês; indicado quando for necessário time no painel, mais créditos e observabilidade.

| Usuários | Atual, ambos gratuitos | Supabase Pro + Netlify Personal | Supabase Pro + Netlify Pro |
|---:|---:|---:|---:|
| 1 | US$ 9,71 | US$ 43,71 | US$ 54,71 |
| 5 | US$ 26,86 | US$ 60,86 | US$ 71,86 |
| 10 | US$ 49,71 | US$ 83,71 | US$ 94,71 |

Os usuários do aplicativo não são assentos do Netlify. Portanto, ter 10 jornalistas no Copy News não exige 10 licenças Netlify.

## Fontes de preço

- [OpenRouter: GPT-4.1 mini](https://openrouter.ai/openai/gpt-4.1-mini/pricing)
- [OpenRouter: Whisper Large V3](https://openrouter.ai/openai/whisper-large-v3/pricing)
- [OpenRouter: Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite/providers)
- [OpenRouter: preços e taxa da plataforma](https://openrouter.ai/pricing)
- [Railway: planos e recursos](https://railway.com/pricing)
- [Supabase: preços](https://supabase.com/pricing)
- [Netlify: preços](https://www.netlify.com/pricing/)

Estas são projeções, não uma fatura. Depois de 30 dias, recalcular com duração média real, tokens por job, uso de RAM/CPU e egress medidos nos painéis.
