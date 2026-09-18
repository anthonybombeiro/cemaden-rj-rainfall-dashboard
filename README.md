# Dashboard Pluviométrico CEMADEN-RJ (2019-2026)

![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)
![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![HTML5](https://img.shields.io/badge/HTML5-Latest-orange)

## 📊 Visão Geral

Dashboard interativo para análise histórica de dados de precipitação (chuva) coletados pelo **Sistema Remoto de Alerta e Alarme (SRAAS)** do **CEMADEN-RJ** para o período de **2019 a 2026**.

O projeto consolida dados pluviométricos de todos os municípios monitorados pelo sistema, apresentando visualizações, comparativos e rankings de eventos extremos.

## 🎯 Funcionalidades

### Página Principal (Overview)
- **Heatmaps Interativos**: Visualização de precipitação total e dias chuvosos por município e ano
- **Ranking de Eventos**: Top 40 maiores acumulados diários em toda a região
- **KPIs**: Indicadores-chave de precipitação
- **Análise Geral**: Insights textuais sobre padrões de chuva

### Por Município
- **Comparativo de Anos**: Gráficos de barras coloridos por nível de risco
- **Tabelas Detalhadas**: Todas as métricas por ano
- **Análises Específicas**: Texto descritivo sobre o padrão de chuvas de cada município
- **Download de Dados**: Exportação em CSV

### Análises Avançadas
- Comparativo entre anos de cada município
- Distribuição de dias chuvosos
- Legenda de risco colorida
- Gráficos responsivos

## 🎨 Paleta de Cores

Utiliza escala de 5 níveis para indicar intensidade de precipitação:

| Nível | Cor | Hex | Significado |
|-------|-----|-----|-------------|
| Muito Baixo | 🟢 Verde | #28A745 | &lt; 25% |
| Baixo | 🟡 Amarelo | #FFE510 | 25-50% |
| Moderado | 🟠 Laranja | #FD7E14 | 50-75% |
| Alto | 🔴 Vermelho | #DC3545 | 75-90% |
| Muito Alto | 🟣 Roxo | #6F42C1 | &gt; 90% |

## 📈 Metodologia

### Cálculos
- **Base**: Coluna `tempo15m` dos arquivos CSV para evitar valores exagerados
- **Sem Médias**: Todos os comparativos usam **MÁXIMO** entre estações, nunca média
- **Período**: Dados 2019-2026 (2026 parcial até data de processamento)
- **Granularidade**: Município, Ano, Estação

### Estatísticas Calculadas
1. **Acumulado Mensal**: Soma de precipitação em mm para cada mês
2. **Dias com Chuva**: Contagem de dias com precipitação > 0
3. **Maior Evento Diário**: Máxima precipitação em 24 horas
4. **Média Diária**: Acumulado / número de dias

## 🛠️ Estrutura Técnica

### Backend (Python)
- **Linguagem**: Python 3.8+
- **Bibliotecas**: Pandas, NumPy
- **Entrada**: 96 arquivos CSV (12 meses × 8 anos)
- **Saída**: JSON + CSVs + HTML

### Frontend (JavaScript/HTML)
- **Framework**: Vanilla JavaScript (sem dependências pesadas)
- **Gráficos**: Chart.js
- **Estilo**: CSS3 com suporte a temas light/dark
- **Responsividade**: Mobile-first design

## 📁 Arquivos do Projeto

```
.
├── README.md                           # Este arquivo
├── dashboard.html                      # Dashboard principal (interface)
├── rainfall_data.json                  # Dados processados (gerado)
├── process_rainfall_data.py            # Script de processamento básico
├── process_rainfall_advanced.py        # Script com análises avançadas
├── csv_exports/                        # Exportações CSV (gerado)
│   ├── resumo_geral.csv
│   └── top_eventos.csv
└── docs/                               # Documentação
    └── ESTRUTURA_DADOS.md
```

## 🚀 Como Usar

### Execução Local

1. **Pré-requisitos**
   ```bash
   python --version  # Python 3.8 ou superior
   pip install pandas numpy
   ```

2. **Processar Dados**
   ```bash
   # Processamento padrão
   python process_rainfall_data.py
   
   # Ou versão avançada com análises por estação
   python process_rainfall_advanced.py
   ```

3. **Visualizar Dashboard**
   - Abra `dashboard.html` em um navegador moderno
   - Ou use um servidor local: `python -m http.server 8000`

### Dados de Entrada

Os dados devem estar organizados em:
```
C:\IA\claude\DADOS PLUVIOMÉTRICOS_2019_2026\
├── 01_jan/
│   ├── HistoricoPluvCalculado_2019_01.csv
│   ├── HistoricoPluvCalculado_2020_01.csv
│   └── ...
├── 02_fev/
│   └── ...
└── ...
```

**Formato do CSV**:
- Separador: `;` (ponto-e-vírgula)
- Encoding: UTF-8 ou Latin-1
- Colunas obrigatórias:
  - `nomeMunicipio`: Nome do município
  - `nomeEstacao`: Nome da estação
  - `tempo15m`: Precipitação em 15 minutos
  - `dataHora`: Data e hora da leitura

## 📊 Estrutura de Dados

### JSON de Saída

```json
{
  "by_municipality_year": {
    "RIO DE JANEIRO": {
      "2019": {
        "total_rainfall": 1234.56,
        "rainy_days": 120,
        "max_daily": 89.34,
        "avg_daily": 10.28
      }
    }
  },
  "daily_maxima_by_station": [
    {
      "municipality": "DUQUE DE CAXIAS",
      "station": "EST_001",
      "year": 2023,
      "date": "2023-12-15",
      "rainfall": 156.78
    }
  ]
}
```

## 🎯 Casos de Uso

1. **Análise Histórica**: Entender padrões de precipitação ao longo de 8 anos
2. **Preparação de Eventos Extremos**: Identificar períodos críticos com maior incidência de chuva intensa
3. **Validação de Limiares**: Ajustar alertas com base em dados históricos
4. **Comunicação com Gestores**: Relatórios visuais e exportáveis
5. **Pesquisa**: Série histórica para análises climáticas

## 🔧 Personalização

### Modificar Paleta de Cores

Edite as variáveis CSS em `dashboard.html`:

```css
:root {
    --risk-very-low: #28A745;
    --risk-low: #FFE510;
    --risk-moderate: #FD7E14;
    --risk-high: #DC3545;
    --risk-very-high: #6F42C1;
}
```

### Ajustar Limites de Risco

Modifique a função `getColorForValue()` em `dashboard.html`:

```javascript
if (percentage < 25) return 'var(--risk-very-low)';
if (percentage < 50) return 'var(--risk-low)';
// ... etc
```

## 📱 Compatibilidade

- **Navegadores**: Chrome, Firefox, Safari, Edge (versões modernas)
- **Mobile**: Responsivo para tablets e smartphones
- **Impressão**: Estilos otimizados para impressão em PDF

## 🐛 Troubleshooting

### Erro: "Falha ao Carregar Dados"
- Certifique-se que `rainfall_data.json` está no mesmo diretório que o HTML
- Execute `process_rainfall_advanced.py` para gerar o arquivo

### Heatmap em Branco
- Verifique o console do navegador (F12) para mensagens de erro
- Confirme que os dados JSON foram carregados corretamente

### Gráficos Não Renderizam
- Verifique conexão com CDN (Chart.js)
- Tente fazer reload da página (Ctrl+F5)

## 📝 Notas Importantes

- **Dados Parciais**: 2026 contém apenas dados até a data de processamento
- **Lacunas de Dados**: Algumas estações podem ter períodos sem leitura
- **Máximos, Não Médias**: Sempre usamos valor máximo entre estações
- **Atualização**: Reprocesse os dados mensalmente para manter atualizado

## 👥 Créditos

- **Desenvolvido**: Claude Haiku 4.5
- **Fonte de Dados**: CEMADEN-RJ Sistema Remoto de Alerta e Alarme
- **Período**: Setembro de 2026

## 📄 Licença

Este projeto é desenvolvido para análise e monitoramento de precipitação pelo CEMADEN-RJ.

## 📧 Contato

Para dúvidas ou sugestões sobre os dados ou análises, entre em contato com o CEMADEN-RJ.

---

**Última Atualização**: Setembro 2026
**Status**: ✅ Em operação
