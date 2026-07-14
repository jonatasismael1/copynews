# Estimativa mensal de custos

Atualizada em 14 de julho de 2026. Conversão de referência: **US$ 1 = R$ 5,12**, PTAX de venda do Banco Central de 13/07/2026. Valores antes de IOF e outros impostos.

## Resumo objetivo

Premissa: 15 publicações por usuário/dia, 30 dias, total de 450 publicações por usuário/mês. A transcrição vem desativada e é ligada apenas nos vídeos em que a fala é necessária.

| Usuários | Posts/mês | OpenRouter | Railway | Total mensal |
|---:|---:|---:|---:|---:|
| 1 | 450 | US$ 2,92 / R$ 14,95 | US$ 6 / R$ 30,72 | **US$ 8,92 / R$ 45,67** |
| 5 | 2.250 | US$ 13,40 / R$ 68,61 | US$ 10 / R$ 51,20 | **US$ 23,40 / R$ 119,81** |
| 10 | 4.500 | US$ 26,59 / R$ 136,14 | US$ 16 / R$ 81,92 | **US$ 42,59 / R$ 218,06** |

O OpenRouter cobra 5,5% na compra de créditos, com taxa mínima de US$ 0,80. A primeira recarga mínima custa **US$ 5,80 / R$ 29,70**, mas o saldo restante continua disponível.

Faixas prudentes do Railway: US$ 5–8 para 1 usuário, US$ 7–14 para 5 e US$ 10–24 para 10. Tamanho e duração dos vídeos, RAM, picos simultâneos e tráfego de mídia explicam a variação.

## Efeito da transcrição

Com Whisper Large V3, cada minuto transcrito custa US$ 0,0015. Se todas as 450 publicações mensais de cada usuário tiverem um minuto de áudio, a transcrição acrescenta **US$ 0,68 / R$ 3,46 por usuário/mês** em créditos.

| Usuários | Total com transcrição desligada por padrão | Total se todos os posts forem transcritos |
|---:|---:|---:|
| 1 | **US$ 8,92 / R$ 45,67** | US$ 9,71 / R$ 49,72 |
| 5 | **US$ 23,40 / R$ 119,81** | US$ 26,86 / R$ 137,52 |
| 10 | **US$ 42,59 / R$ 218,06** | US$ 49,71 / R$ 254,52 |

## IA recomendada

Custos abaixo são de inferência para 450 posts/mês, sem transcrição e sem a taxa de compra dos créditos.

| Estratégia | USD/mês | BRL/mês | Decisão |
|---|---:|---:|---|
| GPT-4.1 mini para texto e OCR | US$ 2,52 | R$ 12,90 | **Produção atual; melhor fidelidade editorial** |
| GPT-4.1 mini no texto + Gemini Flash Lite no OCR | US$ 1,22 | R$ 6,27 | **Melhor economia mantendo a qualidade do redator** |
| GPT-4o mini para texto e OCR | US$ 0,95 | R$ 4,84 | Mais barato, mas pode resumir ou omitir detalhes |
| Gemini Flash Lite para texto e OCR | US$ 0,63 | R$ 3,23 | Bom para OCR; não recomendado como redator final |
| Gemini 2.5 Flash para texto e OCR | US$ 2,48 | R$ 12,67 | Preço parecido; tende a reformular mais |
| Claude Haiku 4.5 para texto e OCR | US$ 6,75 | R$ 34,56 | Qualidade boa, custo desnecessário para este fluxo |

Decisão recomendada: manter **GPT-4.1 mini para título e legenda**. Depois de validar 50 posts reais, pode-se usar **Gemini 2.5 Flash Lite somente no OCR**, reduzindo essa parte da IA em aproximadamente 52% sem trocar o redator.

Para áudio, manter **Whisper Large V3** nos casos ativados. O Turbo reduziria o gasto de transcrição de US$ 0,68 para cerca de US$ 0,30 por usuário/mês, uma economia de apenas **US$ 0,38 / R$ 1,92**, pequena diante do risco com nomes próprios, ruas e áudio externo.

## Supabase e Netlify pagos

- Supabase Pro: US$ 25 / R$ 128,00 por mês.
- Netlify Personal: US$ 9 / R$ 46,08 por mês.
- Netlify Pro: US$ 20 / R$ 102,40 por mês.

| Usuários | Ambos gratuitos | Supabase Pro + Netlify Personal | Supabase Pro + Netlify Pro |
|---:|---:|---:|---:|
| 1 | US$ 8,92 / R$ 45,67 | **US$ 42,92 / R$ 219,75** | US$ 53,92 / R$ 276,07 |
| 5 | US$ 23,40 / R$ 119,81 | **US$ 57,40 / R$ 293,89** | US$ 68,40 / R$ 350,21 |
| 10 | US$ 42,59 / R$ 218,06 | **US$ 76,59 / R$ 392,14** | US$ 87,59 / R$ 448,46 |

Os usuários do Copy News não são assentos do Netlify. Dez jornalistas no aplicativo não exigem dez licenças do Netlify.

## Fontes

- [Banco Central: API PTAX](https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao#!/recursos)
- [OpenRouter: GPT-4.1 mini](https://openrouter.ai/openai/gpt-4.1-mini/pricing)
- [OpenRouter: Whisper Large V3](https://openrouter.ai/openai/whisper-large-v3/pricing)
- [OpenRouter: Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite/providers)
- [OpenRouter: taxas](https://openrouter.ai/pricing)
- [Railway](https://railway.com/pricing)
- [Supabase](https://supabase.com/pricing)
- [Netlify](https://www.netlify.com/pricing/)

Após 30 dias, substitua as premissas pelos dados reais dos painéis: minutos transcritos, tokens, RAM, CPU e egress.
