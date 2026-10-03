# API REDEMET — Documentação Completa de Dados e Animação

**Testado em produção: 02/10/2026**

## Visão Geral

A API REDEMET (Rede de Meteorologia do Comando da Aeronáutica, DECEA) fornece:
1. **Dados METAR** de estações (aeródromos + plataformas offshore)
2. **Imagens de satélite** (infravermelho, realçada, visível)
3. **Imagens de radar** (5 tipos de corte de altitude)
4. **Suporte a animação** para as imagens (histórico de até 15 quadros)

---

## 1. Endpoint Base

```
Base URL: https://api-redemet.decea.mil.br
Autenticação: Header X-Api-Key
Exemplo: X-Api-Key: <sua-api-key>
```

---

## 2. Dados METAR (Estações da Aeronáutica)

### 2.1 Listar aeródromos

```http
GET /aerodromos
```

**Resposta (array):**
```json
{
  "data": [
    {
      "cod": "SBGL",
      "nome": "Aeroporto Internacional do Rio de Janeiro / Galeão",
      "pais": "BRASIL",
      "cidade": "Rio de Janeiro/RJ",
      "lat_dec": -22.80,
      "lon_dec": -43.25,
      "altitude_metros": 7,
      "fuso": "-03:00"
    },
    ...
  ]
}
```

**Campos capturados pelo conector:**
- `cod` → `external_id` (chave única)
- `nome` → `name`
- `cidade` → `municipality` (normalizado para "Rio de Janeiro")
- `lat_dec`, `lon_dec` → latitude/longitude
- `altitude_metros` → altitude_m
- `raw_metadata` → todo o objeto original salvo para referência

**Filtros aplicados no conector:**
- Apenas `pais` = "BRASIL" ou "BRAZIL"
- Apenas `cidade` terminando com "RJ"
- Resultado: **17 estações no RJ** (11 aeródromos + 5 plataformas Petrobras + Porto do Açu)

---

### 2.2 Obter METAR mais recente

```http
GET /mensagens/metar/{icao}
```

Exemplo: `GET /mensagens/metar/SBGL`

**Resposta:**
```json
{
  "data": {
    "data": [
      {
        "recebimento": "2026-10-02 21:59:50",
        "mens": "METAR SBGL 021359Z 27003KT 9999 FEW030 BKN050 23/19 Q1016 RMK"
      }
    ]
  }
}
```

**Campos capturados:**
- `recebimento` → timestamp da leitura (convertido para UTC)
- `mens` → texto METAR bruto (parseado com regex)

**Dados extraídos do METAR (via regex):**

| Campo | Regex | ReadingType | Unidade | Exemplo |
|-------|-------|-------------|---------|---------|
| Direção | `(\d{3}\|VRB)` | `vento_dir_graus` | graus | 270 |
| Velocidade | `(\d{2,3})KT` | `vento_ms` | m/s | 5.57 (convertido de nós) |
| Rajada | `G(\d{2,3})KT` | `vento_rajada_ms` | m/s | 9.26 (convertido de nós) |
| Temperatura | `(M?\d{2})/(M?\d{2})` | `temperatura_c` | °C | 23 |
| Ponto Orvalho | `(M?\d{2})/(M?\d{2})` | `ponto_orvalho_c` | °C | 19 |
| QNH (Pressão) | `Q(\d{3,4})` | `pressao_nm_hpa` | hPa | 1016 |

**Nota:** "M" prefixo = negativo (ex: "M02" = -2°C). Nós convertidos para m/s com fator `0.514444`.

**Dados NÃO capturados (apenas armazenados em raw_payload):**
- Fenômenos de tempo presente (RA, TSRA, etc)
- Visibilidade (9999 = "visibilidade ilimitada")
- Nuvens (FEW, BKN, OVC)
- Observações (RMK)

---

## 3. Imagens de Satélite

### 3.1 Endpoint

```http
GET /produtos/satelite/{tipo}?data={YYYYMMDDHH}&anima={1..15}
```

**Parâmetros:**
- `tipo` (obrigatório): `ir`, `realcada`, `vis`
- `data` (opcional): formato YYYYMMDDHH, default = agora
- `anima` (opcional): número de quadros do histórico (1-15), default = 1

---

### 3.2 Tipos de satélite

| Tipo | Nome | Uso | Resolução | Melhor horário |
|------|------|-----|-----------|----------------|
| `ir` | Infravermelho | Noite e dia, detecta nuvens frias | Baixa | 24h |
| `realcada` | Infravermelho realçada | Dia e noite, cores destacam nuvens | Média | 24h |
| `vis` | Visível | Detalhado, melhor definição | Alta | Apenas dia |

**Testado em 02/10/2026:**
- `ir`: timestamp `2026-10-02 02:30:00`
- `realcada`: timestamp `2026-10-02 02:30:00`
- `vis`: timestamp `2026-10-01 22:40:00` (disponível só durante dia)

---

### 3.3 Resposta JSON

```json
{
  "tipo": "realcada",
  "timestamp": "2026-10-02 02:30:00",
  "image_url": "https://estatico-redemet.decea.mil.br/satelite/2026/10/02/realcada/maps/realcada_202610020230.png",
  "bounds": [
    [-56, -100],
    [12.52, -25.24]
  ]
}
```

**Campos:**
- `tipo`: tipo de imagem solicitado
- `timestamp`: quando a imagem foi gerada (UTC)
- `image_url`: URL pública (sem autenticação) para baixar a imagem PNG (~1,3MB)
- `bounds`: limites geográficos `[[lat_min, lon_min], [lat_max, lon_max]]` — cobre Brasil + América do Sul

**Nota importante:** as imagens PNG ficam em `estatico-redemet.decea.mil.br` (host público) que **não exige API key**. O backend só faz proxy do JSON (cache 5 min), o navegador carrega a imagem direto.

---

### 3.4 Animação de satélite

Exemplo: últimos 3 quadros de satélite realçado

```http
GET /produtos/satelite/realcada?anima=3
```

Retorna um array de até 15 objetos, um por quadro:

```json
{
  "data": {
    "satelite": [
      {
        "data": "2026-10-02 02:00:00",
        "path": "https://estatico-redemet.decea.mil.br/satelite/2026/10/02/realcada/maps/realcada_202610020200.png"
      },
      {
        "data": "2026-10-02 02:15:00",
        "path": "https://estatico-redemet.decea.mil.br/satelite/2026/10/02/realcada/maps/realcada_202610020215.png"
      },
      {
        "data": "2026-10-02 02:30:00",
        "path": "https://estatico-redemet.decea.mil.br/satelite/2026/10/02/realcada/maps/realcada_202610020230.png"
      }
    ],
    "lat_lon": {
      "lat_min": -56,
      "lat_max": 12.52,
      "lon_min": -100,
      "lon_max": -25.24
    }
  }
}
```

**Implementação recomendada no frontend:**
1. Chamar `GET /api/imagery/satelite/?tipo=realcada&anima=15` (novo endpoint)
2. Descer `data.satelite[*].path` para um array
3. Usar biblioteca como `gif.js` ou loop DOM para criar animação GIF/sequência de imagens
4. Adicionar player (play/pause/velocidade) com os timestamps

---

## 4. Imagens de Radar

### 4.1 Endpoint

```http
GET /produtos/radar/{tipo}?area={codigo}&data={YYYYMMDDHH}&anima={1..15}
```

**Parâmetros:**
- `tipo` (obrigatório): `maxcappi`, `10km`, `07km`, `05km`, `03km`
- `area` (obrigatório): código do radar — **Para RJ: `pc` (Pico do Couto, Petrópolis)**
- `data` (opcional): YYYYMMDDHH, default = agora
- `anima` (opcional): 1-15 quadros, default = 1

---

### 4.2 Tipos de radar

| Tipo | Altitude | Raio | Uso | Resolução |
|------|----------|------|-----|-----------|
| `maxcappi` | 400km altura | 400km | Composição total (default) | 1,0 km |
| `10km` | 10 km altura | 250km | Precipitação em altitude | 0,5 km |
| `07km` | 7 km altura | 250km | Nuvens de tempestade | 0,5 km |
| `05km` | 5 km altura | 250km | Estrutura média | 0,5 km |
| `03km` | 3 km altura | 250km | Base das nuvens | 0,5 km |

**Testado em 02/10/2026:**
Todos os 5 tipos devolveram imagem com dados recentes (últimas 2-6 minutos).

---

### 4.3 Resposta JSON

```json
{
  "tipo": "maxcappi",
  "area": "pc",
  "timestamp": "2026-10-02 02:46:47",
  "image_url": "https://estatico-redemet.decea.mil.br/radar/2026/10/02/pc/maxcappi/maps/2026-10-02--02:46:47.png",
  "bounds": [
    [-26.048384, -47.2829],
    [-18.828, -39.30158]
  ]
}
```

**Campos:** mesmos do satélite + `area` (código do radar).

**Limites (bounds):**
- MAXCAPPI: ~400km raio da estação (cobre RJ inteiro + SP + arredores)
- CAPPI 10km/7km/5km/3km: ~250km raio cada (cobertura mais restrita)

---

### 4.4 Animação de radar

```http
GET /produtos/radar/maxcappi?area=pc&anima=10
```

Retorna estrutura similar ao satélite:

```json
{
  "data": {
    "radar": [
      [
        {
          "data": "2026-10-02 02:26:47",
          "path": "https://estatico-redemet.decea.mil.br/radar/2026/10/02/pc/maxcappi/maps/2026-10-02--02:26:47.png"
        },
        {
          "data": "2026-10-02 02:31:47",
          "path": "https://estatico-redemet.decea.mil.br/radar/2026/10/02/pc/maxcappi/maps/2026-10-02--02:31:47.png"
        },
        ...
      ]
    ]
  }
}
```

**Nota:** a resposta agrupa quadros por área (aninhado em array de arrays), já que a API suporta múltiplas áreas — como pedimos só `pc`, usamos `radar[0]`.

---

## 5. Suporte a Animação — Implementação Prática

### 5.1 O que a API oferece

✅ **Satélite:**
- Até 15 quadros históricos com timestamps
- Intervalo: ~15 minutos entre quadros
- Exemplo: `anima=15` retorna as últimas ~3,75 horas

✅ **Radar:** (corrigido em 03/10/2026, conferido no site oficial)
- Só **8 quadros reais** (slider 0-7 em redemet.decea.mil.br); pedir mais
  faz a API repetir o último quadro
- Intervalo observado no MAXCAPPI: ~20 minutos (CAPPI pode variar)
- Com `anima>1` a resposta traz 1 grupo por quadro no tempo (cada um com 1
  entrada por área), não 1 grupo com N quadros

### 5.2 Próximos passos para animar no frontend

**Opção 1: GIF animado (simples, nativo)**
```javascript
// 1. Chamar API com anima=15
// 2. Descer array de URLs
// 3. Usar gif.js para converter PNGs → GIF
// 4. Carregar o GIF em <img>
```

**Opção 2: Carousel manual (controle fino)**
```javascript
// 1. Chamar API com anima=15
// 2. Carregar as imagens em <ImageOverlay> do Leaflet
// 3. Loop com play/pause/velocidade
// 4. Atualizar timestamp visível a cada frame
```

**Opção 3: Hybrid (player + cache)**
```javascript
// 1. Chamar API quando usuário clica "Animar"
// 2. Cache as PNGs localmente (Service Worker)
// 3. Loop local sem refetch
// 4. Melhor UX + economiza banda
```

---

## 6. Estações REDEMET no RJ — Lista Completa

**Testadas em 02/10/2026 — 17 estações**

### Aeródromos

| ICAO | Nome | Município | Status METAR |
|------|------|-----------|--------------|
| SBGL | Galeão | Rio de Janeiro | ✅ Ativo |
| SBRJ | Santos Dumont | Rio de Janeiro | ✅ Ativo |
| SBJR | Jacarepaguá | Rio de Janeiro | ✅ Ativo |
| SBSC | Santa Cruz | Rio de Janeiro | ✅ Ativo |
| SBAF | Campo dos Afonsos | Rio de Janeiro | ⚠️ Sem torre 24h |
| SBME | Macaé | Macaé | ✅ Ativo |
| SBCB | Cabo Frio | Cabo Frio | ⚠️ Sem torre 24h |
| SBCP | Campos dos Goytacazes | Campos | ⚠️ Sem torre 24h |
| SBES | São Pedro da Aldeia | São Pedro da Aldeia | ⚠️ Sem torre 24h |
| SBMI | Maricá | Maricá | ✅ Ativo |
| SBPW | Porto do Açu | São João da Barra | ⚠️ Sem torre 24h |

### Plataformas Petrobras (Offshore)

| ICAO | Nome | Localização | Status METAR |
|------|------|-------------|--------------|
| SBEN | Plataforma Enchova (PCE-1) | Macaé | ✅ Ativo |
| SBLB | Plataforma Albacora (P-25) | Macaé | ✅ Ativo |
| SBLI | Plataforma P-51 | Macaé | ✅ Ativo |
| SBMM | Plataforma P-20 | Macaé | ✅ Ativo |
| SBRC | Plataforma P-52 | Macaé | ✅ Ativo |

---

## 7. Instabilidade de Conexão Documentada

Em 01-02/10/2026, a API-REDEMET ocasionalmente resetava a conexão no meio de respostas grandes. **Resolução:** retry automático com backoff.

```python
def _get_com_retentativa(path: str, params: dict, tries: int = 3, timeout: int = 30):
    for tentativa in range(tries):
        try:
            resp = requests.get(..., timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.RequestException:
            time.sleep(1.5 * (tentativa + 1))
    raise  # última tentativa falhou
```

Implementado em:
- `backend/ingestion/connectors/redemet.py` (`_get_with_retry`)
- `backend/api/redemet_imagery_views.py` (`_get_com_retentativa`)

---

## 8. Cache no Backend

**TTL do cache Django (LocMemCache):** 300 segundos (5 min)

**Cache keys:**
- `redemet:satelite:{tipo}` → último JSON de satélite
- `redemet:radar:{tipo}:{area}` → último JSON de radar

**Motivo:** imagens não mudam a cada segundo; cache evita bater na API a cada abertura do mapa.

---

## 9. Configuração Necessária

```bash
# .env do backend
REDEMET_API_KEY=<sua-api-key-aqui>

# Acesso:
# https://api-redemet.decea.mil.br/cadastro-api/
# Aprovação instantânea, api_key gerada na hora
```

---

## 10. Status Implementação — 02/10/2026

| Recurso | Endpoint | Frontend | Animação |
|---------|----------|----------|----------|
| ✅ METAR | `/api/refresh/` | Tabela Dados/Meteorológicos | N/A |
| ✅ Satélite | `/api/imagery/satelite/` | Mapa (botão toggle) | ⏳ Planejado |
| ✅ Radar | `/api/imagery/radar/` | Mapa (botão toggle) | ⏳ Planejado |
| ⏳ Animação Satélite | Com `anima=15` | Não implementado | Próxima fase |
| ⏳ Animação Radar | Com `anima=15` | Não implementado | Próxima fase |
| ⏳ Carta SIGWX | Disponível | Não implementado | Baixa prioridade |

---

## Referências

- Site REDEMET: https://redemet.decea.mil.br
- Cadastro API: https://api-redemet.decea.mil.br/cadastro-api/
- Ajuda: https://ajuda.decea.mil.br/base-de-conhecimento/api-redemet-o-que-e/
- Código backend: `backend/ingestion/connectors/redemet.py`
- Proxy de imagens: `backend/api/redemet_imagery_views.py`
- Frontend: `frontend/src/components/MapView.tsx`
