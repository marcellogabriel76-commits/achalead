# Achalead

Ferramenta para achar estabelecimentos e lojas **sem site** por nicho e cidade.

- `index.html`: o site (busca, filtros, lista de resultados, mini CRM, exportação CSV). Visual liquid glass com cena 3D em Three.js (carregada do jsDelivr). Se o navegador não tiver WebGL ou estiver offline, o fundo 3D some e o resto continua funcionando. Quem ativa "reduzir movimento" no sistema recebe a versão sem animações.
- `api/search.js`: função da Vercel que consulta o OpenStreetMap (sem chave de API, sem custo)

## Publicar na Vercel

1. Crie um repositório no GitHub e envie estes arquivos.
2. Na Vercel, clique em **Add New → Project** e escolha o repositório.
3. Deixe tudo no padrão e clique em **Deploy**.

Ou pela linha de comando: `npx vercel --prod` dentro da pasta.

Abrir o `index.html` direto no computador mostra só o modo exemplo, porque a busca real roda na função `/api/search`.

## Como a busca funciona

1. O Nominatim acha a cidade.
2. O Overpass lista os negócios do nicho dentro do raio escolhido.
3. Quem não tem os campos `website`, `contact:website` ou `url` (ou só tem Facebook/Instagram) entra como "sem site".

Nichos conhecidos (chaveiro, padaria, barbearia, oficina etc.) usam as categorias do mapa. Qualquer outro texto vira uma busca pelo nome do estabelecimento.

## Limites

- O OpenStreetMap depende de cadastro voluntário. Cidades grandes têm mais dados; em cidades pequenas a lista pode vir curta.
- Telefone aparece só quando alguém o cadastrou no mapa.
- Sempre confira no Google antes de abordar.

## Para ter dados do Google Maps (avaliações, mais telefones)

Troque a busca em `api/search.js` pela Places API do Google (precisa de chave e tem custo por consulta). Guarde a chave em `GOOGLE_PLACES_API_KEY` nas variáveis de ambiente da Vercel, nunca no código do navegador.
