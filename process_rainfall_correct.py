#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd
from pathlib import Path
import json
from datetime import datetime

base_path = Path(r'C:\IA\claude\DADOS PLUVIOMÉTRICOS_2019_2026')
month_dirs = ['01_jan', '02_fev', '03_mar', '04_abr', '05_mai', '06_jun',
              '07_jul', '08_ago', '09_set', '10_out', '11_nov', '12_dez']

by_mun_year_month = {}
daily_maxima_events = []

print("Processando dados pluviometricos...")

for year in range(2019, 2027):
    for month_num, month_dir in enumerate(month_dirs, 1):
        file_path = base_path / month_dir / f'HistoricoPluvCalculado_{year}_{month_num:02d}.csv'

        if not file_path.exists():
            continue

        print(f"  {year}-{month_num:02d}...", end='', flush=True)

        try:
            df = pd.read_csv(file_path, encoding='latin1', sep=';', on_bad_lines='skip')
        except:
            print(" skip", end='')
            continue

        # Validar colunas
        if 'nomeMunicipio' not in df.columns or 'nomeEstacao' not in df.columns or 'tempo15m' not in df.columns:
            print(" cols", end='')
            continue

        # Converter data/hora
        try:
            df['datetime'] = pd.to_datetime(df['dataHora'], format='%d/%m/%Y %H:%M:%S')
            df['data'] = df['datetime'].dt.date
        except:
            print(" date", end='')
            continue

        # CORRECAO: Pegar apenas leitura ULTIMA de cada 15-min window
        # (porque tempo15m eh acumulativo de 15 min)
        df['minuto_floor'] = df['datetime'].dt.floor('15min')
        df_15min = df.groupby(['nomeMunicipio', 'nomeEstacao', 'data', 'minuto_floor'])['tempo15m'].last().reset_index()

        # Agrupar por municipio, estacao, data
        for (mun, station, data), grp in df_15min.groupby(['nomeMunicipio', 'nomeEstacao', 'data']):
            daily_total = grp['tempo15m'].sum()

            if mun not in by_mun_year_month:
                by_mun_year_month[mun] = {}
            if year not in by_mun_year_month[mun]:
                by_mun_year_month[mun][year] = {}
            if month_num not in by_mun_year_month[mun][year]:
                by_mun_year_month[mun][year][month_num] = {'stations': {}}

            if station not in by_mun_year_month[mun][year][month_num]['stations']:
                by_mun_year_month[mun][year][month_num]['stations'][station] = []

            by_mun_year_month[mun][year][month_num]['stations'][station].append(daily_total)

            # Track top events
            if daily_total > 50:
                daily_maxima_events.append({
                    'municipality': mun,
                    'station': station,
                    'date': str(data),
                    'rainfall_mm': float(daily_total)
                })

        print(" ok", end='')

print("\n\nAgregando dados...")

# Estrutura final
final_data = {
    'metadata': {
        'created': datetime.now().isoformat(),
        'period': '2019-2026',
        'structure': 'Por municipio - pega MAXIMO entre estacoes',
        'data_source': 'CEMADEN-RJ SRAAS',
        'base_column': 'tempo15m',
        'calculation': 'ULTIMA leitura a cada 15min → SUM(tempo15m) por dia por estacao → MAX(estacoes) para municipio',
        'stations': 86
    },
    'municipalities': sorted(list(by_mun_year_month.keys())),
    'by_municipality_year_month': {},
    'daily_maxima': sorted(daily_maxima_events, key=lambda x: -x['rainfall_mm'])[:100]
}

# Processar dados
for mun in by_mun_year_month:
    final_data['by_municipality_year_month'][mun] = {}

    for year in by_mun_year_month[mun]:
        final_data['by_municipality_year_month'][mun][year] = {}

        for month in by_mun_year_month[mun][year]:
            stations_data = by_mun_year_month[mun][year][month]['stations']

            all_daily = []
            station_totals = {}
            station_rainy_days = {}

            for station, daily_values in stations_data.items():
                total = sum(daily_values)
                rainy_days = sum(1 for v in daily_values if v > 0.5)
                max_daily = max(daily_values) if daily_values else 0
                avg_daily = total / len(daily_values) if daily_values else 0

                station_totals[station] = total
                station_rainy_days[station] = rainy_days
                all_daily.extend(daily_values)

            # Máximo entre estações
            max_total = max(station_totals.values()) if station_totals else 0
            max_rainy = max(station_rainy_days.values()) if station_rainy_days else 0
            max_daily_mm = max(all_daily) if all_daily else 0
            avg_daily_mm = sum(all_daily) / len(all_daily) if all_daily else 0

            final_data['by_municipality_year_month'][mun][year][month] = {
                'total_mm': float(max_total),
                'rainy_days': int(max_rainy),
                'max_daily_mm': float(max_daily_mm),
                'avg_daily_mm': float(avg_daily_mm),
                'num_stations': len(stations_data)
            }

# Salvar
output_path = Path('rainfall_data_correto_final.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final_data, f, ensure_ascii=False, separators=(',', ':'))

print(f"OK! {len(final_data['daily_maxima'])} eventos")
print(f"Tamanho: {output_path.stat().st_size / (1024*1024):.1f} MB")

# Verificacao
petro = [m for m in final_data['by_municipality_year_month'].keys() if 'Petr' in m][0]
print(f"\nVerificacao - {petro} marco 2024:")
print(f"  Total: {final_data['by_municipality_year_month'][petro]['2024']['3']['total_mm']:.1f} mm")
print(f"  Max daily: {final_data['by_municipality_year_month'][petro]['2024']['3']['max_daily_mm']:.1f} mm")

for e in final_data['daily_maxima'][:3]:
    if e['date'] == '2024-03-22':
        print(f"\n22/03/2024 - {e['municipality']}: {e['rainfall_mm']:.1f} mm")
