# Plano de Unificação de 92 Municípios do RJ

**Status:** 🟢 Implementação iniciada
**Data:** 2026-09-24
**Objetivo:** Eliminar duplicação de nomes de municípios (variações de capitalização, acentuação, grafia)

---

## Diagnóstico

- **Total de municípios reais no RJ:** 92 (segundo IBGE)
- **Problema observado:** Tabelas/mapas do painel mostravam >92 nomes diferentes por causa de variações:
  - Capitalização: "Rio de Janeiro" vs "RIO DE JANEIRO"
  - Acentuação: "São Gonçalo" vs "SAO GONCALO"
  - Espaçamento: "BAIXADA LITORÂNEA" vs "BAIXADA  LITORÂNEA" (múltiplos espaços)
  - Grafia: "Armação de Búzios" vs "Armação dos Búzios" (uma discrepância real entre fontes)

- **Fontes de nomes no painel:**
  - `frontend/src/lib/contatosData.ts`: 92 nomes (canônicos, com acentos)
  - `rj_municipios.geojson`: 92 nomes (propriedade `nome` com acentos, `nomeNormalizado` em CAPS sem acentos)
  - `rj_municipios_centroides.json`: 92 entradas normalizadas
  - `backend/core/models.py`: CharField sem constraints (permite duplicatas/variações)

- **Causa raiz:** Banco de dados usa CharField livre para `Station.municipality`, `AlertRule.municipality`, `RiskAlert.municipio`. Conectores de ingestão (INMET, Alerta Rio, etc.) salvam variações sem normalização.

---

## Solução: 3 Fases

### Fase 1: ✅ COMPLETA — Fonte Canônica Centralizada

**Arquivos criados:**

1. **`frontend/src/lib/municipios-canonical.ts`** (novo)
   - Array `MUNICIPIOS_CANONICOS` com os 92 nomes reais (captura apropriada com acentos)
   - Função `normalizarParaMunicipioCanonico(nome)` → encontra o nome canônico para qualquer variação
   - Função `isMunicipioValido(nome)` → valida se um nome é um dos 92
   - Função `assertMunicipioCanonico(nome)` → lança erro se inválido (útil em backend/frontend)
   - Função `normalizarArrayMunicipios(nomes)` → normaliza arrays inteiros
   - Função `filtrarMunicipiosInvalidos(nomes)` → auditoria
   - Mapa `VARIACAO_PARA_CANONICO` pré-computado com todas as variações conhecidas (CAPS, sem acentos, etc.)

2. **`backend/core/management/commands/normalize_municipios.py`** (novo)
   - Audita nomes únicos em `Station.municipality`, `AlertRule.municipality`, `RiskAlert.municipio`
   - Mapeia cada nome para um dos 92 canônicos (ou marca como inválido)
   - Modo preview (padrão): lista o que seria corrigido, sem modificar banco
   - Modo `--fix`: aplica as correções (UPDATE em massa)
   - Usa a mesma lógica de normalização do frontend para consistência

3. **`frontend/src/lib/api.ts`** (atualizado)
   - Função `normalizeMunicipioName()` mantida por backward-compatibility
   - Documentação adicionada indicando deprecation em favor de `normalizarParaMunicipioCanonico`
   - Nota: continua usada em geo.ts (para gerar chaves de busca no GeoJSON), não foi refatorado ainda

---

### Fase 2: 🟡 PRÓXIMA — Sincronizar Backend

**O que fazer:**

1. **Executar auditoria:**
   ```bash
   python manage.py normalize_municipios --verbose
   ```
   Isso vai listar todos os nomes únicos e indicar quais são inválidos.

2. **Corrigir banco de dados:**
   ```bash
   python manage.py normalize_municipios --fix
   ```
   Isso faz UPDATE em massa convertendo cada variação para o nome canônico.

3. **Atualizar conectores de ingestão** (`backend/ingestion/connectors/*.py`):
   - Cada conector que salva `Station.municipality` deve usar a normalização
   - Exemplo: após extrair `municipality` de uma resposta de API externa, validar com `assertMunicipioCanonico()` (vai lançar erro se inválido, evitando lixo no banco)
   - **Conectores a atualizar:**
     - `inmet.py` (linha 85)
     - `alerta_rio.py` (linha 218)
     - `cemaden_rj_pluviometros.py` (linha 114)
     - `cemaden_rj_alertas.py` (linhas 102-110)
     - `wunderground.py`
     - `plugfield.py`
     - Qualquer outro que leia `municipality` de API externa

4. **Atualizar models** (`backend/core/models.py`):
   - Adicionar validação nas choices ou no `clean()` method de `Station`, `AlertRule`, `RiskAlert`
   - Exemplo:
     ```python
     from municipios_canonical import MUNICIPIOS_CANONICOS
     
     class Station(models.Model):
       municipality = models.CharField(
         max_length=120,
         choices=[(m, m) for m in MUNICIPIOS_CANONICOS],  # Força choice de um dos 92
         ...
       )
     ```
   - ⚠️ Problema: `municipios-canonical.ts` está em JavaScript/TypeScript no frontend. Será necessário:
     - Copiar a lista para um arquivo Python no backend (`backend/core/municipios.py`), OU
     - Usar um package shared (menos prático para este projeto)

---

### Fase 3: 🔴 FUTURA — Sincronizar Frontend

**O que fazer:**

1. **Atualizar componentes de filtro/seleção:**
   - `DataTable.tsx`, `PrecipitationTable.tsx`, etc. que mostram dropdowns de município
   - Em vez de coletar nomes da API sem validação, usar `normalizarArrayMunicipios()` do canonical

2. **Importar `normalizarParaMunicipioCanonico` nos componentes:**
   - Qualquer lugar que aceite entrada de usuário ou dados de API deve normalizar para um dos 92
   - Exemplo: campo de filtro "Buscar municipio" em `AlertsPanel.tsx`

3. **Atualizar `ContatosMap.tsx`:**
   - Já usa `MUNICIPIOS_CONTATOS` (que tem os 92), então está OK

4. **Refatorar `geo.ts` e uso de `normalizeMunicipioName()`:**
   - Hoje `GeoJsonFeatureCollection` espera `nomeNormalizado` (CAPS, sem acentos) como chave
   - Quando refatorar, considerar adicionar um índice de mapeamento também: `{ "RIO DE JANEIRO": "Rio de Janeiro", ... }`
   - Ou manter como está (é uma chave interna, não visível ao usuário)

---

## Arquivos Criados/Modificados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `frontend/src/lib/municipios-canonical.ts` | ✅ Novo | Lista canônica + funções de normalização |
| `backend/core/management/commands/normalize_municipios.py` | ✅ Novo | Auditoria + correção em massa |
| `backend/core/management/__init__.py` | ✅ Novo | Estrutura de management commands |
| `backend/core/management/commands/__init__.py` | ✅ Novo | Estrutura de management commands |
| `frontend/src/lib/api.ts` | ✅ Modificado | Documentação de deprecation |
| Conectores de ingestão | ⏳ Pendente | Refatorar para usar canonical |
| `backend/core/models.py` | ⏳ Pendente | Adicionar choices/validação |
| Componentes de filtro | ⏳ Pendente | Usar `normalizarArrayMunicipios()` |

---

## Como Testar Localmente

1. **Backend:**
   ```bash
   cd backend
   # Preview das mudanças
   python manage.py normalize_municipios --verbose
   
   # Aplicar (se houver inconsistências)
   python manage.py normalize_municipios --fix --verbose
   ```

2. **Frontend:**
   ```bash
   # Importar e testar a função
   import { normalizarParaMunicipioCanonico } from '@/lib/municipios-canonical';
   
   console.log(normalizarParaMunicipioCanonico("RIO DE JANEIRO")); // "Rio de Janeiro"
   console.log(normalizarParaMunicipioCanonico("rio de janeiro")); // "Rio de Janeiro"
   console.log(normalizarParaMunicipioCanonico("ARMACAO DE BUZIOS")); // "Armação dos Búzios"
   console.log(normalizarParaMunicipioCanonico("Invalidão")); // null
   ```

---

## Casos Especiais Tratados

1. **"Armação de Búzios" vs "Armação dos Búzios":**
   - Canônico: **"Armação dos Búzios"** (conforme `contatosData.ts` e GeoJSON)
   - Mapeamento: "ARMACAO DE BUZIOS" → "Armação dos Búzios"
   - Origem da discrepância: GeoJSON IBGE usa "dos", mas alguma fonte (possivelmente Defesa Civil) pode ter "de"

2. **Capitalização:**
   - Todos os 92 canônicos estão em **Title Case com acentos** (ex: "São Gonçalo", "Três Rios")
   - Funções de busca/normalização aceitam qualquer caso

3. **Acentuação:**
   - Canônicos contêm acentos (ç, ã, á, é, etc.)
   - Normalização via NFKD → remove acentos apenas em chaves internas (não afeta o nome exibido)

4. **Espaçamento:**
   - Múltiplos espaços são colapsados em um
   - Espaços leading/trailing removidos

---

## Próximos Passos Imediatos

1. **Executar comando de auditoria:**
   - Ver quantos registros no banco diferem do canônico
   - Decidir se precisa de `--fix`

2. **Se houver inválidos:**
   - Investigar origem (qual conector gerou o nome errado?)
   - Corrigir conector + rodar `normalize_municipios --fix`

3. **Atualizar backend/core/municipios.py (novo arquivo):**
   - Copiar lista canônica para Python
   - Usar em `models.py` para validação
   - Conectores usam para asserter entrada

4. **Refatorar conectores de ingestão:**
   - Importar `assertMunicipioCanonico` ou similar
   - Garantir que tout `municipality` salvo passa pelo validador

5. **Teste end-to-end:**
   - Ingestão (rodar um conector manual)
   - Auditoria (verificar com command)
   - UI (verificar que filtros mostram apenas 92)

---

## Referência: Lista dos 92 Canônicos

```
Angra dos Reis, Aperibé, Araruama, Areal, Armação dos Búzios,
Arraial do Cabo, Barra Mansa, Barra do Piraí, Belford Roxo,
Bom Jardim, Bom Jesus do Itabapoana, Cabo Frio, Cachoeira de Macacu,
Cambuci, Campos dos Goytacazes, Cantagalo, Carapebus,
Cardoso Moreira, Carmo, Casimiro de Abreu, Comendador Levy Gasparian,
Conceição de Macabu, Cordeiro, Duas Barras, Duque de Caxias,
Engenheiro Paulo de Frontin, Guapimirim, Iguaba Grande, Itaboraí,
Itaguaí, Italva, Itaocara, Itaperuna, Itatiaia, Japeri,
Laje de Muriaé, Macaé, Macuco, Magé, Mangaratiba, Maricá,
Mendes, Mesquita, Miguel Pereira, Miracema, Natividade, Nilópolis,
Niterói, Nova Friburgo, Nova Iguaçu, Paracambi, Paraty,
Paraíba do Sul, Paty do Alferes, Petrópolis, Pinheiral, Piraí,
Porciúncula, Porto Real, Quatis, Queimados, Quissamã, Resende,
Rio Bonito, Rio Claro, Rio das Flores, Rio das Ostras,
Rio de Janeiro, Santa Maria Madalena, Santo Antônio de Pádua,
Sapucaia, Saquarema, Seropédica, Silva Jardim, Sumidouro,
São Fidélis, São Francisco de Itabapoana, São Gonçalo,
São José de Ubá, São José do Vale do Rio Preto, São João da Barra,
São João de Meriti, São Pedro da Aldeia, São Sebastião do Alto,
Tanguá, Teresópolis, Trajano de Moraes, Três Rios, Valença,
Varre-Saí, Vassouras, Volta Redonda
```

---

## Notas Importantes

- **Sempre tratar "Capital" como "Rio de Janeiro"** (conforme requisito do usuário)
- **A Capital está na REDEC 1**, nas diferentes abas e mapas
- **92 é o número definitivo** — qualquer desvio é bug, não feature
- **Compatibilidade backward:** função `normalizeMunicipioName()` mantida em `api.ts` por enquanto, mas códigos novos devem usar `normalizarParaMunicipioCanonico()`
