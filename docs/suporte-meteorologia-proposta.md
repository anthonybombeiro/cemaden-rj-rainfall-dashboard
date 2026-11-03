# Suporte de Meteorologia — proposta e protótipo local (03/11/2026)

Pedido: "Suporte de Meteorologia (IDAP, Cell Broadcast, tabela de severidade). Indicar como pretende implementar, fazer localmente, mas não subir para a produção."

**Estado:** protótipo pronto **só no ambiente local** (`frontend/src/components/producao/SuporteMeteorologia.tsx`), visível apenas com `NEXT_PUBLIC_MET_EXPERIMENTAL=1`. O build de produção não inclui o código. Nada foi publicado.

## Ideia

Uma aba **Produção → Meteorologia → Suporte**, no mesmo padrão do Guia do Plantão do NM: conteúdo de apoio que o técnico consulta no meio de um envio, sem dados do banco. Três blocos, todos do Protocolo de Meteorologia 2026:

1. **Idap — SMS e TV** (procedimento 01): passo a passo (login por CPF intransferível, Alertas → "+ Adicionar Novo Alerta", espera do "ok" do diretor/subdiretor, conferência e senha), tabela dos campos a preencher (severidade Alta/Muito Alta, forma de envio SMS e TV, categoria Chuvas Intensas, urgência Esperado, confiança Possível, ação necessária, vigência, localização) e **dois contadores com botão copiar**: SMS (146 caracteres) e TV (62, só severidade MUITO ALTA); passou do limite, o contador fica vermelho e lembra de avisar a meteorologista. Aviso fixo: ação "abrigar/evacuar/executar" gera Cell Broadcast, não SMS.
2. **Cell Broadcast / Defesa Civil Alerta**: níveis Severo e Extremo (urgência, confiança, ação, critérios de uso), os dois cenários de envio com os critérios (núcleo ≥ 40 mm/h, alertas do INMET/CEMADEN, análise final da CEPDEC e polígono), o modelo da mensagem (instituição, possibilidade de desastre, intensidade, local, risco, ação, recomendação, contatos) e os exemplos. Lembrete: enviado **apenas pela meteorologista de plantão**.
3. **Níveis de severidade meteorológica** (procedimento 09): tabela nível × evento × ações recomendadas, com as cores (verde, amarelo, laranja, vermelho, roxo), para chuva, granizo, rajada, umidade, ressaca, raio, onda de calor/frio.

## Como foi implementado

* Componente único, só frontend, dados estáticos (transcritos do protocolo; as tabelas do protocolo vieram de imagens, então **conferir contra as figuras** antes de publicar).
* Carregado com `React.lazy` atrás da flag: sem a flag a aba não existe e o código nem entra no bundle.
* Reaproveita o padrão de contador/cópia do Guia do Plantão.

## Para publicar depois

1. Conferir as tabelas com as figuras 6 a 10 e 37 do protocolo.
2. Decidir as divergências: rajada "muito forte" (76 × 100 km/h) e escalas de chuva.
3. Remover a flag (ou ligar `NEXT_PUBLIC_MET_EXPERIMENTAL=1` no build de produção) e implantar o front: não há migração nem backend.
