# Cadastro da API-REDEMET — passo a passo e texto pronto

**Status: CONCLUÍDO em 02/10/2026.** O usuário se cadastrou e recebeu a
`api_key` **imediatamente** (aprovação automática/na hora, não manual) — a
chave já está configurada e os conectores/camadas já foram implementados
(ver `docs/fontes-de-dados.md`, seção REDEMET). Este passo a passo fica
registrado como referência caso seja preciso gerar uma segunda chave no
futuro (ex: outra conta institucional).

Diferente do INMET (que não tem autoatendimento e depende de e-mail, ver
`docs/email-inmet-rascunho.md`), a REDEMET **não usa e-mail** para pedir
acesso — é um formulário web de autoatendimento. Não há e-mail institucional
publicado para esse pedido específico; o canal oficial é o formulário abaixo.

## Passo a passo

1. Acessar `https://api-redemet.decea.mil.br/cadastro-api/`.
2. Preencher os 4 campos obrigatórios do formulário:
   - **Nome**
   - **Sobrenome**
   - **E-mail** — de preferência um e-mail institucional (@defesacivil.rj.gov.br
     ou do CEMADEN-RJ), mesmo raciocínio já registrado no rascunho do INMET:
     pedidos de acesso a dados governamentais tendem a ser levados mais a
     sério com identificação institucional clara do que com e-mail pessoal.
   - **Motivo de uso da API** — campo de texto livre, limite de 1.500
     caracteres. Texto pronto abaixo.
3. Clicar em "ENVIAR SOLICITAÇÃO".
4. **O que esperar depois:** não encontramos documentação pública sobre prazo
   de aprovação, se é manual ou automática, nem se há custo — isso só se
   descobre preenchendo o formulário. Prestar atenção ao e-mail cadastrado
   (inclusive spam) pela resposta com a `api_key`.

## Texto pronto para o campo "Motivo de uso da api"

Copiar e colar (ajustar nome/cargo entre colchetes antes de enviar):

```
Somos a Defesa Civil do Estado do Rio de Janeiro (CEMADEN-RJ) e estamos
desenvolvendo um painel de agregação de dados meteorológicos e hidrológicos
para apoiar o monitoramento e a tomada de decisão em situações de risco de
desastres naturais relacionados a chuva no estado do RJ. O painel já integra
estações pluviométricas e meteorológicas de diversas fontes (CEMADEN-RJ,
INMET, Alerta Rio/GeoRio, Defesas Civis municipais, entre outras).

Gostaríamos de usar a API-REDEMET para: (1) exibir os dados meteorológicos
(METAR) dos aeródromos do estado do Rio de Janeiro como mais uma camada de
estações no painel; (2) exibir imagens de satélite (infravermelho/visível)
como camada de mapa; (3) exibir, quando disponível, a imagem de radar que
cobre o estado do RJ. O uso seria de consulta automatizada periódica (a cada
10-15 minutos para METAR e satélite), sem redistribuição dos dados brutos —
apenas visualização no painel. Ficamos à disposição para fornecer mais
detalhes sobre o projeto ou assinar eventuais termos de uso necessários.

[SEU NOME]
[SEU CARGO/INSTITUIÇÃO — ex: CEMADEN-RJ / Defesa Civil do Estado do RJ]
```

## Depois de receber a `api_key`

Não commitar a chave no código em hipótese nenhuma (ver histórico de
incidente com a Plugfield em `docs/fontes-de-dados.md`, seção Plugfield).
Passar a chave por variável de ambiente, mesmo padrão já usado no projeto
(`WUNDERGROUND_API_KEY`, etc.) — configurar como `REDEMET_API_KEY` no `.env`
do backend quando o conector for implementado.
