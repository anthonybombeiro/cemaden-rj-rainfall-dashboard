# Estrutura de Dados - Dashboard Pluviométrico CEMADEN-RJ

## 📁 Arquivos de Dados

### rainfall.json
Arquivo JSON principal contendo todas as estatísticas agregadas.

**Exemplo de Estrutura:**

```json
{
  "by_municipality_year": {
    "RIO DE JANEIRO": {
      "2019": {
        "total_rainfall": 1234.56,      // Acumulado total em mm
        "rainy_days": 120,              // Dias com precipitação > 0
        "max_daily": 89.34,             // Maior evento diário em mm
        "avg_daily": 10.28,             // Média diária
        "records_count": 35040          // Total de registros da coluna tempo15m
      },
      "2020": { ... }
    },
    "DUQUE DE CAXIAS": { ... }
  },
  
  "daily_maxima": [
    {
      "municipality": "DUQUE DE CAXIAS",
      "year": 2023,
      "date": "2023-12-15",
      "rainfall": 156.78
    }
  ],
  
  "summary_by_municipality": {
    "RIO DE JANEIRO": {
      "max_rainfall_year": 2023,        // Ano com maior precipitação
      "max_rainfall_value": 14567.89,   // Valor máximo registrado
      "rainy_days_at_max": 245,         // Dias chuvosos naquele ano
      "total_years": 8                  // Anos com dados
    }
  }
}
```

## 📊 Colunas e Significados

### by_municipality_year
Agregação principal dos dados por município e ano.

| Campo | Tipo | Descrição | Unidade |
|-------|------|-----------|---------|
| `total_rainfall` | float | Soma de todo o tempo15m no período | mm |
| `rainy_days` | int | Contagem de medições com tempo15m > 0 | dias |
| `max_daily` | float | Valor máximo de tempo15m em um dia | mm |
| `avg_daily` | float | Média de tempo15m (total / registros) | mm |
| `records_count` | int | Total de linhas processadas | - |

### daily_maxima
Lista dos maiores eventos diários (top 40).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `municipality` | string | Nome do município |
| `year` | int | Ano do evento |
| `date` | string | Data em formato YYYY-MM-DD |
| `rainfall` | float | Precipitação em mm |

### summary_by_municipality
Resumo por município mostrando máximos históricos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `max_rainfall_year` | int | Qual ano teve mais chuva |
| `max_rainfall_value` | float | Total de chuva naquele ano |
| `rainy_days_at_max` | int | Dias chuvosos naquele ano |
| `total_years` | int | Quantos anos de dados |

## 📈 CSV - resumo_geral.csv

Exportação em CSV de todos os dados por município-ano.

```csv
Município,Ano,Total_Chuva_mm,Dias_Chuva,Max_Diario_mm
RIO DE JANEIRO,2019,1234.56,120,89.34
RIO DE JANEIRO,2020,1456.78,145,102.14
DUQUE DE CAXIAS,2019,987.65,98,76.54
...
```

### Colunas do CSV

| Coluna | Tipo | Unidade | Notas |
|--------|------|---------|-------|
| Município | texto | - | Nome do município CEMADEN-RJ |
| Ano | número | - | 2019 a 2026 |
| Total_Chuva_mm | decimal | mm | Soma de tempo15m |
| Dias_Chuva | inteiro | dias | Contagem de medições > 0 |
| Max_Diario_mm | decimal | mm | Maior valor em 24 horas |

## 📊 CSV - top_eventos.csv

Ranking dos 40 maiores eventos diários registrados.

```csv
municipality,station,year,date,rainfall
DUQUE DE CAXIAS,EST_001,2023,2023-12-15,156.78
RIO DE JANEIRO,EST_045,2022,2022-03-20,148.92
...
```

### Colunas do CSV

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| municipality | texto | Nome do município |
| station | texto | Identificador da estação |
| year | número | Ano do evento |
| date | texto | Data (YYYY-MM-DD) |
| rainfall | decimal | Precipitação em mm |

## 🔢 Unidades e Escalas

### tempo15m (Minutos)
- Representa precipitação acumulada em 15 minutos
- Unidade: milímetros (mm)
- Range típico: 0 a 10 mm
- Máximos excecionais: até ~300 mm (eventos extremos)

### Conversões Úteis
```
1 dia = 96 medições de 15 minutos
1 mês = ~2.880 medições
1 ano = ~35.040 medições

Para obter precipitação diária: 
soma_tempo15m_do_dia (mantém valores em mm)

Para obter mensal:
soma_tempo15m_do_mês (mantém valores em mm)

Para obter anual:
soma_tempo15m_do_ano (mantém valores em mm)
```

## 📋 Dados Faltantes / Parciais

### 2026 - Dados Parciais
- Status: **Em Andamento**
- Período: Janeiro até data de processamento
- Marcação: Avisos em âmbar/laranja no dashboard

### Lacunas de Dados
Algumas estações podem ter períodos sem leitura devido a:
- Manutenção do equipamento
- Falhas de transmissão
- Períodos de inatividade

**Impacto**: Valores podem estar subestimados para essas estações/períodos

## 🎯 Metodologia de Agregação

### Por Município
Utiliza **MÁXIMO** entre todas as estações do município, nunca média:
```
total_rainfall[mun] = MAX(total_rainfall[todas as estações])
rainy_days[mun] = MAX(rainy_days[todas as estações])
max_daily[mun] = MAX(max_daily[todas as estações])
```

**Razão**: Uma estação é representativa da chuva no município. Usar máximo evita subestimar eventos extremos.

### Por Ano
Todos os dados de 12 meses são concatenados e processados como um todo:
```
total_rainfall[ano] = SUM(tempo15m[todos os meses do ano])
```

### Por Dia
Para eventos diários:
```
max_daily[data] = MAX(tempo15m[todas as medições daquele dia])
```

## 🔍 Validação de Dados

### Verificações Realizadas
- ✅ Colunas obrigatórias presentes
- ✅ Valores numéricos válidos
- ✅ Datas parseáveis
- ✅ Municipios identificados
- ✅ Sem linhas duplicadas

### Valores Suspeitos
Não há filtros de outliers - eventos extremos são mantidos intencionalmente para análise de riscos.

## 📊 Análise por Heatmap

### Cálculo de Cor
Para cada célula (município × ano):

1. Extrai valor (total_rainfall ou rainy_days)
2. Calcula percentual: `(valor / max_geral) × 100`
3. Aplica escala de 5 níveis:
   - &lt; 25% → Verde (Muito Baixo)
   - 25-50% → Amarelo (Baixo)
   - 50-75% → Laranja (Moderado)
   - 75-90% → Vermelho (Alto)
   - &gt; 90% → Roxo (Muito Alto)

## 🔧 Processamento

### Scripts Utilizados

#### process_rainfall_data.py
- Carrega 96 arquivos CSV (12 meses × 8 anos)
- Calcula agregações básicas
- Gera rainfall_data.json

#### process_rainfall_advanced.py
- Idem, mas com análises por estação
- Desempenho: ~5-10 minutos para 96 arquivos

### Entrada (CSV Original)
```csv
nomeMunicipio;nomeEstacao;tempo15m;...;dataHora
RIO DE JANEIRO;EST_001;2.5;...;2023-12-15 10:30:00
```

### Saída (JSON Processado)
```json
{
  "by_municipality_year": { ... },
  "daily_maxima_by_station": [ ... ],
  "summary_by_municipality": { ... }
}
```

## 📱 Compatibilidade com Dashboard

### Requisitos do rainfall.json
- Deve estar em `data/rainfall.json`
- Encoding: UTF-8
- Tamanho: típicamente 2-5 MB
- Carregamento: automático ao abrir o dashboard

### Se JSON Não Carregar
1. Verifique se arquivo existe: `data/rainfall.json`
2. Valide JSON: https://jsonlint.com/
3. Verifique console (F12) para mensagens de erro
4. Confirme arquivo não está corrompido

## 🔄 Atualização de Dados

### Frequência Recomendada
- **Mensal**: Processar após coleta de dados completos
- **Trimestral**: Análise de tendências
- **Anual**: Relatório completo

### Procedimento
```bash
# 1. Obter novos CSVs em C:\IA\claude\DADOS PLUVIOMÉTRICOS_2019_2026
# 2. Executar script
python process_rainfall_advanced.py
# 3. Copiar rainfall_data.json para data/rainfall.json
# 4. Fazer commit e push
git add data/rainfall.json
git commit -m "Atualizar dados pluviométricos"
git push
```

## 📚 Referências Adicionais

- CEMADEN-RJ: Sistema Remoto de Alerta e Alarme
- Período: 2019-2026 (dados de precipitação)
- Fonte: Estações pluviométricas distribuídas em municípios RJ
- Granularidade temporal: 15 minutos
- Granularidade espacial: Por município (múltiplas estações)

---

**Última Atualização**: Setembro 2026
**Versão**: 1.0
