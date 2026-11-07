"""Avisos meteorológicos de 2024 e 2025 (artes das pastas "Avisos 2024" e "Avisos 2025" do Drive), transcritos das imagens.

Regras da transcrição: o texto é o corpo do aviso, sem os rótulos "Previsão:" e "Sistema(s):" (o painel monta a linha de sistemas a partir de `sistemas`);
sistema fora do catálogo (massa de ar polar, ressaca, ciclone extratropical) entra no fim do texto como "Sistema atuante: ...". "Fenômeno: Onda de Calor" fica
no texto. `icones` segue o que o texto descreve (chuva/vento); aviso só de calor ou umidade fica sem ícone. Lacunas (números que não estão nas pastas):
2024 nº 15 e 16; 2025 nº 01, 06 e 17 — não foram inventadas. O "Aviso de Mau Tempo nº 674/2025" (Marinha, 24/10/2025) não é aviso do CEMADEN e não entra."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.utils import timezone

from core.models import AvisoMeteorologico

USUARIO = "importação (Drive 2024-2025)"


def _d(ano: int, dia: int, mes: int, hora: int, minuto: int = 0) -> dt.datetime:
    return timezone.make_aware(dt.datetime(ano, mes, dia, hora, minuto))


def _a(ano, numero, ini, fim, sistemas, icones, texto, regioes=None, fim_ano=None):
    return {"numero": numero, "inicio": _d(ano, *ini), "fim": _d(fim_ano or ano, *fim), "sistemas": sistemas, "icones": icones, "texto": texto, "regioes": regioes or []}


# ini e fim: (dia, mes, hora[, minuto]); `fim_ano` só quando a vigência termina no ano seguinte
AVISOS_2024 = [
    _a(2024, 1, (13, 1, 0), (14, 1, 12), ["baixa_pressao"], ["chuva", "vento"],
       "Um Sistema de Baixa Pressão provocará chuvas fortes a muito fortes em todo o estado, no sábado (13) e no domingo (14). Durante o período vigente, ocorrerão altos acumulados de chuva e rajadas de vento moderado a forte."),
    _a(2024, 2, (19, 1, 15), (22, 1, 0), ["frente_fria"], ["chuva", "vento"],
       "A aproximação de uma frente fria provocará áreas de instabilidades hoje (19) que possibilitará pancadas de chuva moderada a forte em todo o estado. No sábado (20) e no domingo (21), a passagem da frente fria ocasionará pancadas moderadas a muito forte a qualquer momento. Durante o período vigente, ocorrerão altos acumulados de chuva e rajadas de vento moderado a forte."),
    _a(2024, 3, (23, 1, 15), (24, 1, 23, 59), ["instabilidade"], ["chuva"],
       "Áreas de instabilidade sobre o estado provocarão chuvas moderadas a qualquer momento, gerando altos acumulados durante o período vigente.",
       ["COSTA VERDE", "SUL I", "SUL II", "CAPITAL", "BAIXADA FLUMINENSE", "BAIXADA LITORÂNEA", "SERRANA I", "METROPOLITANA"]),
    _a(2024, 4, (31, 1, 15), (2, 2, 21), ["instabilidade"], ["chuva"],
       "Áreas de instabilidade associada a um sistema de baixa pressão no oceano provocará pancadas de chuva moderadas a fortes, gerando altos acumulados durante o período vigente."),
    _a(2024, 5, (14, 2, 13), (16, 2, 0), ["frente_fria"], ["chuva", "vento"],
       "A passagem de uma frente fria provocará pancadas de chuva moderadas a fortes, acompanhadas de raios e rajadas de ventos moderados a fortes, gerando altos acumulados durante o período vigente."),
    _a(2024, 6, (15, 3, 12), (17, 3, 18), ["alta_pressao"], [],
       "A atuação de um Sistema de Alta Pressão sobre a Região Sudeste deixará o tempo estável no Estado do Rio de Janeiro. Para os próximos dias teremos uma sequência de dias ensolarados e temperaturas elevas, onde as máximas podem se aproximar dos 40°C.\n\nFenômeno: Onda de Calor"),
    _a(2024, 7, (21, 3, 13), (24, 3, 23), ["frente_fria"], ["chuva", "vento"],
       "Nesta quinta-feira (21) à tarde, ocorrerão pancadas de chuva moderada (05 a 24.9mm/h) a forte (25 a 49.9mm/h), em todo o estado, devido ao efeito Pré-Frontal. A chegada de uma Frente Fria, entre a noite de amanhã(21) e a madrugada de sexta-feira (22), provocará chuvas moderadas a muito fortes (acima de 50mm/h), acompanhadas de raios e rajadas de ventos moderados a fortes, gerando altos acumulados (acima de 200mm/24h) no período vigente.\n\n"
       "A Marinha do Brasil emitiu um aviso para ocorrência de ressaca, a partir das 15h de sexta-feira(22) entre Paraty e Arraial do Cabo."),
    _a(2024, 8, (7, 8, 12), (8, 8, 18), ["alta_pressao"], [],
       "A atuação de uma massa de ar seco sobre a Região Sudeste deixará o tempo estável no estado do Rio de Janeiro na quarta-feira (07/08) e na quinta-feira (08/08). A umidade relativa do ar ficará abaixo de 40%, no período da tarde, em todas as regiões do estado, podendo chegar a valores próximos de 20% em alguns pontos afastados do litoral, principalmente nas regiões Sul I, Sul II, Baixada Fluminense, Capital, Metropolitana, Noroeste e Norte."),
    _a(2024, 9, (9, 8, 18), (10, 8, 20), ["frente_fria"], ["chuva", "vento"],
       "A passagem de uma frente fria ocasionará pancadas de chuva podendo ser fortes, rajadas de vento moderado a forte e queda significativa de temperatura."),
    _a(2024, 10, (23, 8, 8), (26, 8, 18), ["frente_fria"], ["vento"],
       "Devido à aproximação e passagem de uma frente fria, há previsão de rajadas de vento moderado a forte (até 75,9 km/h), no estado do Rio de Janeiro, a partir da manhã desta sexta-feira (23/08) até a tarde de segunda-feira (26/08)."),
    _a(2024, 11, (25, 8, 12), (27, 8, 18), ["frente_fria"], ["chuva"],
       "A passagem de uma frente fria hoje (25/08) seguida da atuação de uma massa de ar polar provocará queda acentuada de temperatura e chuva moderada em todo estado nos próximos dias.\n\nSistema atuante: Massa de ar polar."),
    _a(2024, 12, (5, 9, 12), (6, 9, 6), ["frente_fria"], ["vento"],
       "Devido à aproximação e passagem de uma frente fria, há previsão de rajadas de vento moderado a forte (até 75,9 km/h), no estado do Rio de Janeiro, a partir da tarde desta quinta-feira (05/09) até a manhã de sexta-feira (06/09)."),
    _a(2024, 13, (11, 9, 10), (14, 9, 18), ["alta_pressao"], [],
       "A atuação de uma massa de ar seco sobre a Região Sudeste deixará o tempo estável no estado do Rio de Janeiro. Entre hoje, quarta-feira (11/09), e sábado (14/09) a umidade relativa do ar ficará abaixo de 30% no período da tarde, em todas as regiões do estado, podendo chegar a valores abaixo de 20% em algumas regiões."),
    _a(2024, 14, (25, 9, 12), (27, 9, 18), ["alta_pressao"], [],
       "A atuação de um Sistema de Alta Pressão sobre a Região Sudeste deixará o tempo estável no Estado do Rio de Janeiro. Para os próximos dias teremos uma sequência de dias ensolarados e temperaturas elevas, onde as máximas podem se aproximar dos 40°C.\n\nFenômeno: Onda de Calor"),
    _a(2024, 17, (8, 11, 12), (10, 11, 0), ["frente_fria", "convergencia_umidade"], ["chuva", "vento"],
       "A passagem de uma frente fria e a convergência de umidade em baixos e médios níveis da atmosfera poderão provocar pancadas de chuva moderada a forte em todo o estado, sendo ocasionalmente muito forte em algumas regiões, acompanhadas de possíveis rajadas de vento e descargas atmosféricas no estado do Rio de Janeiro entre a tarde desta sexta-feira (08/11) e a noite de sábado (09/11). "
       "Essas chuvas ocorrerão com maior intensidade principalmente entre o período da noite de sexta-feira e a manhã de sábado. Os acumulados poderão ultrapassar os 125 mm entre as REDECs Serrana II, Norte e Noroeste."),
    _a(2024, 18, (2, 12, 15), (5, 12, 0), ["frente_fria"], ["chuva", "vento"],
       "A aproximação de uma frente fria hoje, dia 02 de dezembro, provocará áreas de instabilidade, com possibilidade de pancadas de chuva moderada a forte de forma isolada em todo o estado do Rio de Janeiro. Amanhã, 03 de dezembro, a passagem da frente fria intensificará as condições de chuva, ocasionando precipitação moderada a forte principalmente a partir do período da tarde. "
       "Na quarta-feira, 04 de dezembro, o tempo continuará instável, com previsão de chuva a qualquer momento. Durante o período vigente, ocorrerão altos acumulados de chuva com raios e rajadas de vento moderado a forte."),
    _a(2024, 19, (10, 12, 9), (12, 12, 0), ["frente_fria"], ["chuva", "vento"],
       "A passagem de uma frente fria provocará pancadas de chuva moderadas a fortes no estado do Rio de Janeiro, acompanhadas de raios e rajadas de ventos, gerando altos acumulados durante o período vigente."),
    _a(2024, 20, (14, 12, 15), (16, 12, 0), ["instabilidade"], ["chuva", "vento"],
       "Um sistema de baixa pressão atmosférica próximo à costa do estado, combinado com o calor e a alta umidade, favorecerá a formação de áreas de instabilidade ao longo do dia. Estas condições podem resultar em pancadas de chuva de intensidade moderada a forte, acompanhadas de descargas elétricas e rajadas de vento moderadas a fortes. "
       "Espera-se altos acumulados de chuva, especialmente nas regiões da Costa Verde, Sul I, Sul II, Baixada Fluminense, Serrana I e Serrana II."),
    _a(2024, 21, (20, 12, 17), (23, 12, 10), ["frente_fria"], ["chuva", "vento"],
       "A aproximação e passagem de uma frente causará pancadas de chuva moderada a forte, podendo chegar a muito forte e vir acompanhadas de raios e rajadas de vento, entre a tarde do dia 20 e a manhã do dia 23. Durante o período vigente são esperados altos acumulados."),
    _a(2024, 22, (28, 12, 10), (30, 12, 10), ["zcas"], ["chuva"],
       "A atuação de uma Zona de Convergência do Atlântico Sul (ZCAS) sobre o estado do Rio de Janeiro causará pancadas de chuva moderada (5.1 a 25.1 mm/h) a forte (25.1 a 50,0 mm/h), podendo chegar a muito forte (> 50mm/h) e que podem vir acompanhadas de raios, entre o dia 28 e a manhã do dia 30. "
       "São esperados grandes acumulados em todas as regiões, podendo passar de 100 mm na região serrana durante este período."),
]

AVISOS_2025 = [
    _a(2025, 2, (30, 1, 0), (4, 2, 0), ["canal_umidade", "baixa_pressao"], ["chuva", "vento"],
       "A formação de um canal de umidade nos baixos níveis da atmosfera, somada a um sistema de baixa pressão já atuante na costa da Região Sudeste, irão manter o tempo instável sobre o estado. Durante o período são esperadas ao longo dos dias pancadas isoladas de chuva moderada a forte, sendo ocasionalmente muito forte, que podem vir com raios e rajadas de vento. "
       "Essa combinação de fatores pode acarretar em eventos hidrológicos críticos, como alagamentos, inundações e enxurradas, e suscetibilidade a deslizamentos, devido aos altos acumulados já registrados nos dias anteriores. Os maiores efeitos são esperados nas REDECs Sul I, Sul II, Costa Verde, Serrana I e Serrana II."),
    _a(2025, 3, (4, 2, 12), (7, 2, 18), ["alta_pressao"], [],
       "A atuação de um Sistema de Alta Pressão deixará o tempo estável no Estado do Rio de Janeiro. Para os próximos dias teremos uma sequência de dias ensolarados e temperaturas elevas, onde as máximas podem se aproximar dos 40°C. Para se proteger, é fundamental manter-se hidratado, evitar exposição ao sol nos horários mais quentes do dia, usar roupas leves e protetor solar, além de permanecer em locais arejados sempre que possível. "
       "Crianças, idosos e animais de estimação requerem atenção especial nesse período."),
    _a(2025, 4, (19, 3, 0), (21, 3, 0), ["frente_fria", "transporte_umidade"], ["chuva", "vento"],
       "A passagem de uma frente fria pelo oceano e o posterior transporte de umidade em direção ao continente causarão, para a quarta-feira (19/03), pancadas de chuva moderada a forte, podendo chegar a muito forte em algumas regiões, acompanhadas de raios e rajadas de vento. Há possibilidade de granizo. Para quinta-feira (20/03) ainda são esperadas pancadas isoladas de chuva moderada a forte. "
       "São esperados altos acumulados ao longo do estado durante o período."),
    _a(2025, 5, (3, 4, 12), (7, 4, 0), ["frente_fria", "transporte_umidade"], ["chuva", "vento"],
       "A passagem de uma frente fria e o posterior transporte de umidade no estado do Rio de Janeiro causarão:\n\n"
       "**Quinta-feira** (03/04) - pancadas isoladas de chuva **moderada a forte**, acompanhadas de descargas atmosféricas (**raios**) e rajadas de vento.\n\n"
       "**Sexta-feira** (04/04) - pancadas isoladas de chuva **moderada a muito forte**, acompanhadas de descargas atmosféricas (**raios**) e rajadas de vento, que se intensificarão durante a noite.\n\n"
       "**Sábado** (05/04) - pancadas **moderadas a muito fortes**, acompanhadas de descargas atmosféricas (**raios**) e rajadas de vento, nas regiões **Serrana**, **Norte e Noroeste** e chuva moderada, eventualmente forte, constante no resto do estado.\n\n"
       "**Domingo** (06/04) - chuva **fraca a moderada** ao longo do estado durante todo o dia.\n\n"
       "Ocorrerá declínio de temperatura a partir do dia 03/04. São esperados altos acumulados em todo o estado, principalmente nas regiões Costa Verde e Serrana."),
    _a(2025, 7, (29, 5, 12), (31, 5, 12), ["frente_fria"], ["chuva", "vento"],
       "Uma massa de ar frio de origem polar avança em direção ao estado do Rio de Janeiro, favorecendo a queda gradual de temperatura. A partir da noite de quinta-feira (29/05), com a passagem da frente fria, a sensação de frio se intensifica, além da previsão de pancadas isoladas de chuva fraca a moderada, sem acumulados significativos. Também, há previsão de vento moderado a forte, que podem acentuar a sensação de frio.\n"
       "O cenário mais crítico está previsto para sexta-feira (30/05), quando a temperatura permanecerá baixa ao longo de todo o dia, com pouca variação térmica e muita nebulosidade.\n\n"
       "Recomenda-se atenção especial a pessoas em situação de vulnerabilidade, idosos, crianças e animais, devido à previsão de frio mais intenso e prolongado.\n\n"
       "Seguimos em monitoramento e qualquer atualização será prontamente divulgada."),
    _a(2025, 8, (9, 6, 13), (14, 6, 18), [], [],
       "Uma massa de ar frio de origem polar avança sobre o estado do Rio de Janeiro favorecendo a queda de temperatura. A partir da noite de hoje (09/06) a sensação de frio se intensifica.\n\n"
       "Recomenda-se atenção especial a pessoas em situação de vulnerabilidade, idosos, crianças e animais, devido à queda de temperatura mais intensa e prolongada.\n\n"
       "Seguimos em monitoramento e qualquer atualização será prontamente divulgada.\n\nSistema atuante: Massa de ar frio."),
    _a(2025, 9, (24, 6, 0), (25, 6, 23), ["frente_fria"], ["chuva", "vento"],
       "Uma frente fria chegará amanhã (24) provocando chuvas fracas a moderadas, em todas as regiões, e rajadas de vento de até 70km/h, nas regiões do litoral fluminense. No decorrer do dia, haverá a queda acentuada de temperatura, registrando as temperaturas mínimas no período da tarde/noite.\n\n"
       "A Marinha do Brasil emitiu um aviso de ressaca a partir da tarde de terça-feira (24) até o fim da noite de quarta-feira (25), com ondas de 2.5 a 3.0 metros entre Paraty e Arraial do Cabo.\n\n"
       "Na quarta-feira (25), as temperaturas estarão em declínio, a máxima não ultrapassa os 24°C e a mínima chega aos 8°C, nas regiões Serrana e Sul.\n\n"
       "Recomenda-se atenção especial a pessoas em situação de vulnerabilidade, idosos, crianças e animais, devido à previsão de frio mais intenso e prolongado.\n\n"
       "Seguimos em monitoramento e qualquer atualização será prontamente divulgada.\n\nSistema atuante: Massa de ar polar."),
    _a(2025, 10, (28, 7, 11), (31, 7, 0), ["frente_fria", "baixa_pressao"], ["vento"],
       "**VENTOS**\n\n"
       "A aproximação e passagem de uma frente fria, associada a um sistema de baixa pressão, causará rajadas de vento moderado (18,6 - 51,9 km/h) a forte (52 - 75,9 km/h) em todo o estado, podendo chegar a muito forte (acima de 76 km/h) nas regiões litorâneas, entre a manhã de hoje (28/07) até a noite de quarta-feira (30/07).\n\n"
       "A equipe da Defesa Civil segue monitorando e qualquer atualização será prontamente divulgada."),
    _a(2025, 11, (20, 8, 12), (25, 8, 18), ["alta_pressao"], [],
       "Nos próximos dias, o estado do Rio de Janeiro será influenciado por um sistema de alta pressão, que manterá o tempo estável, com predomínio de sol e ausência de chuva significativa. Essa condição, conhecido como \"veranico\", provocará elevação gradual das temperaturas máximas.\n\n"
       "A partir de amanhã (20/08), as máximas poderão ultrapassar 32ºC em grande parte do estado. Além do calor, a umidade do ar ficará reduzida no período da tarde, aumentando o risco de fogo em vegetação e de desconforto térmico.\n\n"
       "A Defesa Civil orienta cuidados como hidratação, roupas leves, protetor solar e evitar o sol nos períodos mais quentes."),
    _a(2025, 12, (8, 9, 19), (10, 9, 0), [], ["vento"],
       "A aproximação de um Ciclone Extratropical provocará rajadas de vento moderado a muito forte (60-85 km/h) na faixa litorânea do estado, da Costa Verde até a Baixada Litorânea. As regiões Baixada Fluminense, Serrana I e Serrana II também terão rajadas de vento muito forte.\n\n"
       "Amanhã (09/09), as máximas irão utrapassar os 35ºC em grande parte do estado. Além do calor, a umidade do ar ficará reduzida no período da tarde, atingindo 25% de mínima e aumentando o risco de fogo em vegetação e de desconforto térmico.\n\n"
       "A Defesa Civil orienta cuidados como hidratação, roupas leves, protetor solar e evitar o sol nos períodos mais quentes.\n\n"
       "A equipe da Defesa Civil segue monitorando e qualquer atualização será prontamente divulgada.\n\nSistema atuante: Aproximação de um Ciclone Extratropical.",
       ["BAIXADA FLUMINENSE", "BAIXADA LITORÂNEA", "CAPITAL", "COSTA VERDE", "METROPOLITANA", "SERRANA I", "SERRANA II", "SUL II"]),
    _a(2025, 13, (22, 9, 18), (23, 9, 7), ["frente_fria"], ["chuva", "vento"],
       "A passagem de uma frente fria na noite de hoje provocará pancadas de chuva forte a muito forte, podendo ser acompanhadas de granizo, raios e rajadas de vento moderado (18,5 - 51,9 km/h) a muito forte (60-85 km/h) em todas as regiões do Estado. Há previsão de queda de temperatura a partir de amanhã (23/09).\n\n"
       "A equipe da Defesa Civil segue monitorando e qualquer atualização será prontamente divulgada."),
    _a(2025, 14, (18, 10, 12), (20, 10, 0), ["frente_fria"], ["chuva", "vento"],
       "A passagem de uma frente fria deixará o tempo instável nesse fim de semana, a partir da tarde de sábado, com queda acentuada de temperatura a partir de domingo:\n\n"
       "**Sábado** (18/10) - pancadas **moderadas a fortes**, acompanhadas de **raios** e rajadas de vento moderado a forte na maior parte do estado, principalmente, nas regiões **Serrana I, Serrana II, Sul I, Sul II, Costa Verde e Noroeste.**\n\n"
       "**Domingo** (19/10) - chuva **moderada a forte** até a manhã, passando para fraca a moderada ao longo do dia.\n\n"
       "**Segunda** (20/10) - chuviscos e chuva fraca a qualquer momento, com temperaturas amenas.\n\n"
       "A Marinha do Brasil emitiu um **aviso de ressaca**, a partir da **noite de sábado** até a **noite de domingo**, para todo o **litoral do estado**."),
    _a(2025, 15, (7, 11, 18), (9, 11, 12), ["baixa_pressao"], ["chuva", "vento"],
       "Um sistema de baixa pressão no oceano, próximo à costa, deixará o tempo instável no estado do Rio de Janeiro a partir desta sexta-feira. Entre o final da tarde de hoje (07/11) e o meio-dia de domingo (09/11), são esperadas, em todo o estado, rajadas de vento moderadas (18,6 - 51,9 km/h) a fortes (52 - 75,9 km/h) podendo chegar a ocasionalmente muito forte (acima de 76 km/h) nas regiões litorâneas.\n\n"
       "A partir da tarde de sábado (08/11), há previsão de pancadas de chuva moderadas a fortes, acompanhadas de raios, e, no domingo (09/11), pancadas de chuva fraca a moderada podem ocorrer a qualquer momento do dia.\n\n"
       "A Marinha do Brasil emitiu um aviso de ressaca a partir de amanhã (08h às 12h) até domingo (09h às 21h), com ondas de 2,5 a 3,5 metros entre Paraty e Armação de Búzios.\n\n"
       "A equipe da Defesa Civil segue monitorando e qualquer atualização será prontamente divulgada."),
    _a(2025, 16, (23, 11, 15), (26, 11, 21), ["baixa_pressao"], ["chuva", "vento"],
       "A atuação de um sistema de baixa pressão no oceano, próximo à costa, deixará o tempo instável no estado do Rio de Janeiro a partir deste domingo (23/11).\n\n"
       "Entre a tarde de hoje (23/11) e segunda-feira (24/11), são esperadas pancadas de chuva moderada a forte, acompanhadas de raios e rajadas de vento moderadas.\n\n"
       "Entre a segunda (24/11) e a terça-feira (25/11), o tempo segue instável, com chuvas fracas a moderadas, de forma isolada.\n\n"
       "Na terça-feira (25/11), a partir do final da tarde, o vento se intensifica, com rajadas moderadas (18,6–51,9 km/h) a fortes (52–75,9 km/h) em todo o estado, podendo chegar a ocasionalmente muito fortes (acima de 76 km/h) nas regiões litorâneas.\n\n"
       "Essas rajadas devem persistir até a noite de quarta-feira (26/11).\n\n"
       "A Defesa Civil permanece em monitoramento contínuo, e novas atualizações serão divulgadas sempre que necessário."),
    _a(2025, 18, (26, 12, 14), (29, 12, 19), ["alta_pressao"], [],
       "Um sistema de alta pressão manterá as temperaturas elevadas e umidade relativa do ar baixa, de hoje (26/12) até segunda-feira (29/12) para todo o estado.\n\n"
       "No sábado (27/12), as temperaturas chegarão aos 41ºC nas regiões Sul, Metropolitana e Capital. A umidade relativa do ar ficará abaixo dos 30% no período da tarde.\n\n"
       "No domingo (28/12), as temperaturas permanecerão elevadas com a máxima de 40ºC, nas regiões Sul e Capital. A umidade relativa mínima ficará entre 40 e 25%.\n\n"
       "Na segunda-feira (29/12), a temperatura máxima chegará aos 39ºC, nas regiões Sul e Capital, com umidade relativa do ar chegando aos 30%.\n\n"
       "A Defesa Civil orienta cuidados como hidratação, roupas leves, protetor solar e evitar exposição ao sol nos períodos mais quentes."),
    _a(2025, 19, (31, 12, 12), (1, 1, 6), [], [],
       "A partir de amanhã (31/12), está prevista a ocorrência de ressaca desde a Capital do Rio de Janeiro até o município de Arraial do Cabo. São esperadas ondas de 2,5m e direção Sudoeste/Sul.\n\n"
       "**Recomendações:**\nEvite entrar no mar durante o período de maré alta.\nRespeite rigorosamente a sinalização de segurança e as orientações dos guarda-vidas.\nNão ultrapasse áreas sinalizadas como perigosas.\nCrianças devem permanecer sob supervisão constante de um responsável.\nNão entre no mar após ingestão de bebida alcoólica.\nAfaste-se de costões, pedras e áreas com correnteza visível.\n\n"
       "**Em caso de emergência:**\nProcure imediatamente um guarda-vidas.\nLigue 193 – Corpo de Bombeiros.\n\nSistema atuante: Ressaca.",
       ["CAPITAL", "BAIXADA LITORÂNEA"], fim_ano=2026),
]

HISTORICO = {2024: AVISOS_2024, 2025: AVISOS_2025}


def importar_historico(ano: int, dry_run: bool = False) -> dict:
    """Grava os avisos do ano (2024 ou 2025) nos números reais. Repetível: aviso igual (mesmo número e início) não é tocado; aviso diferente no mesmo
    número NÃO é sobrescrito (vai para `erros`). Retorna criados, ja_existiam, erros, lacunas e o maior número."""
    if ano not in HISTORICO:
        raise ValueError("ano sem histórico para importar")
    out: dict = {"ano": ano, "criados": [], "ja_existiam": [], "erros": []}
    with transaction.atomic():
        for item in HISTORICO[ano]:
            existente = AvisoMeteorologico.objects.filter(ano=ano, numero=item["numero"]).first()
            if existente:
                if existente.estado == "emitido" and existente.vigencia_inicio == item["inicio"]:
                    out["ja_existiam"].append(item["numero"])
                else:
                    out["erros"].append(f"nº {item['numero']}/{ano}: já existe um aviso diferente; não foi sobrescrito.")
                continue
            AvisoMeteorologico.objects.create(
                numero=item["numero"], ano=ano, estado="emitido", vigencia_inicio=item["inicio"], vigencia_fim=item["fim"], regioes=item["regioes"],
                sistemas=item["sistemas"], icones=item["icones"], texto=item["texto"], criado_por=USUARIO, emitido_por=USUARIO, emitido_em=item["inicio"],
                historico=[{"em": timezone.now().isoformat(), "por": USUARIO, "acao": "importou (arte do Drive)"}],
            )
            out["criados"].append(item["numero"])
        numeros = sorted(AvisoMeteorologico.objects.filter(ano=ano, numero__gt=0, numero__lt=900000).values_list("numero", flat=True))
        out["maior"] = numeros[-1] if numeros else 0
        out["lacunas"] = [n for n in range(1, out["maior"] + 1) if n not in numeros]
        if dry_run:
            transaction.set_rollback(True)
    out["dry_run"] = dry_run
    return out
