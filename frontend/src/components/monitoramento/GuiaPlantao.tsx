"use client";

import { Check, Copy } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

import { corTextoSobre, ESCALA_NM } from "@/lib/nivelMonitoramento";

/** Guia do Plantão (Suporte da aba Produção): Portaria MIDR nº 2.458/2026 e PLANCON 2026/2027, itens 2.5, 2.5.1, 2.6 e Anexo III.
 * Texto vindo do guia em HTML entregue pela Direção, refeito com os componentes do painel (versão de 28/10/2026, para capacitação).
 * O assistente de decisão fica no formulário "Lançar nível"; aqui só se aponta para ele. */

type Secao = "mudou" | "niveis" | "duashoras" | "fluxo" | "equipes" | "idap" | "mensagens" | "proibido" | "checklist";
const SECOES: [Secao, string][] = [
  ["mudou", "O que mudou"],
  ["niveis", "Os 6 níveis"],
  ["duashoras", "Regra das 2 h"],
  ["fluxo", "Fluxo do envio (DCA)"],
  ["equipes", "Por equipe"],
  ["idap", "Campos da Idap"],
  ["mensagens", "Mensagens modelo"],
  ["proibido", "Proibido"],
  ["checklist", "Checklist"],
];

const card = "rounded-lg border border-gray-200 bg-white p-3";
const tabela = "w-full text-xs";
const cab = "bg-gray-50 text-left text-gray-500";
const th = "px-2 py-1.5 font-semibold";
const td = "px-2 py-1.5 align-top text-gray-700";

function Chip({ n, extra }: { n: number; extra?: string }) {
  const e = ESCALA_NM[n];
  return (
    <span className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold leading-none" style={{ background: e.cor, color: corTextoSobre(e.cor) }}>
      {e.sigla} {e.nome}
      {extra ? ` · ${extra}` : ""}
    </span>
  );
}

function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-bold text-gray-800">{children}</h3>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className={tabela}>
        <thead className={cab}>
          <tr>{cabecalho.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-gray-100">
              {l.map((c, j) => <td key={j} className={j === 0 ? `${td} font-medium` : td}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Aviso({ tom, children }: { tom: "ambar" | "vermelho" | "azul"; children: ReactNode }) {
  const c = { ambar: "border-amber-300 bg-amber-50 text-amber-900", vermelho: "border-red-300 bg-red-50 text-red-900", azul: "border-blue-200 bg-blue-50 text-blue-900" }[tom];
  return <p className={`rounded-md border p-2.5 text-xs ${c}`}>{children}</p>;
}

function Lista({ itens, cor }: { itens: string[]; cor?: string }) {
  return (
    <ul className="space-y-1 text-xs text-gray-700">
      {itens.map((t) => (
        <li key={t} className="flex gap-1.5">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor ?? "#6b7280" }} />
          {t}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- 1. o que mudou

const MUDOU: [string, string][] = [
  ["Seis níveis em vez de cinco", "Vigilância, Observação, Atenção, Alerta e Alerta Máximo deram lugar a NM 0 a NM 5, com os nomes da Portaria: Baixo, Moderado, Alto, Severo e Extremo."],
  ["O “Alerta Máximo” foi dividido", "Risco muito alto não vira mais automaticamente o nível máximo. Ele pode ser Alto, Severo ou Extremo, conforme a antecedência e a ação esperada da população."],
  ["Severo = impacto em até 2 h", "O NM 4 só existe com impacto esperado em até 2 horas, área delimitada e ação de autoproteção na mensagem. Previsão com mais de 2 h fica no máximo em Alto."],
  ["Severo pode vir do risco alto", "Gatilho de risco alto atingido, inclusive a recomendação de mobilização de sirenes, já é Severo. Na meteorologia, fenômenos súbitos detectados no radar também."],
  ["DCA e TV só no Severo e no Extremo", "Cell Broadcast (DCA) e TV por assinatura ficam proibidos nos NM 2 e NM 3. No NM 1 não há envio nenhum pela Idap."],
  ["Aviso prévio e aprovação", "Antes de Severo ou Extremo: aprovação do Diretor ou do Oficial de Ligação e aviso à COMDEC e à REDEC, com horário registrado."],
];

function Mudou() {
  return (
    <div className="space-y-4">
      <Titulo sub="Se só der tempo de ler uma parte, leia esta.">O que mudou, em poucos pontos</Titulo>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {MUDOU.map(([t, x], i) => (
          <div key={t} className={`${card} flex gap-2`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
            <div>
              <b className="text-sm text-gray-800">{t}</b>
              <p className="mt-0.5 text-xs text-gray-600">{x}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={card}>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Antes × agora</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-600">2025/2026</p>
            <ul className="space-y-1 text-xs text-gray-700">
              {[["Vigilância", "muito baixo"], ["Observação", "baixo"], ["Atenção", "moderado"], ["Alerta", "alto"], ["Alerta Máximo", "muito alto, sem critério de tempo"]].map(([a, b]) => (
                <li key={a} className="rounded bg-gray-100 px-2 py-1"><b>{a}</b> <span className="text-gray-500">· {b}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-600">2026/2027</p>
            <ul className="space-y-1 text-xs">
              <li><Chip n={0} /></li>
              <li><Chip n={1} /></li>
              <li><Chip n={2} /></li>
              <li><Chip n={3} extra="> 2 h" /></li>
              <li><Chip n={4} extra="até 2 h" /></li>
              <li><Chip n={5} extra="em curso" /></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2. os 6 níveis

function Niveis() {
  const linhas: ReactNode[][] = [
    [<Chip key="0" n={0} />, "Risco muito baixo; rotina, sem previsão de evento", "Não há", "Nenhuma", "—", "NR 0"],
    [<Chip key="1" n={1} />, "Risco baixo; possibilidade de evento sem risco iminente", "Não há envio", "Nenhuma (painel e boletins)", "Acompanhar", "NR 1"],
    [<Chip key="2" n={2} />, "Risco moderado; impactos localizados ou em grupos vulneráveis", "Moderado", "Google Alertas, Telegram, WhatsApp; SMS opcional", "Medidas preventivas", "NR 1"],
    [<Chip key="3" n={3} />, "Risco alto ou muito alto previsto com mais de 2 h, ou sem área delimitada", "Alto", "Google Alertas, Telegram, WhatsApp e SMS · sem TV e sem DCA", "Preparar-se", "NR 2"],
    [<Chip key="4" n={4} />, "Risco alto ou muito alto com impacto em até 2 h, área delimitada, população exposta; inclui mobilização de sirenes", "Severo", "Todas, inclusive TV e DCA", "Autoproteção: ir para local seguro / ponto de apoio", "NR 2 (NR 3+ conforme impacto)"],
    [<Chip key="5" n={5} />, "Risco muito alto iminente, evento em curso com ocorrências ou agravamento após a mobilização", "Extremo", "Todas, inclusive TV e DCA", "Evacuar já ou abrigar-se em local seguro", "NR 2 (NR 3+ conforme impacto)"],
  ];
  return (
    <div className="space-y-3">
      <Titulo sub="O nível é definido por município. Se meteorologia, hidrologia e geologia indicarem níveis diferentes para o mesmo município, vale o mais alto.">Os seis Níveis de Monitoramento</Titulo>
      <Tabela cabecalho={["Nível", "Quando usar", "Alerta à população (Idap)", "Ferramentas", "Ação esperada", "NR indicado"]} linhas={linhas} />
      <Aviso tom="azul">Riscos hidrológico e geológico moderados vão só para a COMDEC e a REDEC, pelos canais operacionais, sem alerta à população.</Aviso>
      <figure className={card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/guia/matriz-plancon.jpg" alt="Matriz de correlação entre risco, antecedência e Níveis de Monitoramento (Figura 1 do PLANCON 2026/2027)" className="mx-auto h-auto max-w-full" loading="lazy" />
        <figcaption className="mt-1 text-center text-[11px] text-gray-500">Figura 1 do PLANCON 2026/2027 — matriz de correlação entre risco, antecedência e Níveis de Monitoramento.</figcaption>
      </figure>
    </div>
  );
}

// ---------------------------------------------------------------- 3. regra das 2 horas

function DuasHoras({ onAssistente }: { onAssistente?: () => void }) {
  return (
    <div className="space-y-3">
      <Titulo sub="O risco técnico define o piso do nível. Quando chega o impacto e o que a população precisa fazer definem o teto.">A regra das 2 horas</Titulo>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_1.4fr] md:items-stretch">
        {[
          ["1", "Qual é o risco?", "Muito baixo a muito alto, pela tabela da sua equipe."],
          ["2", "Quando chega o impacto?", "Mais de 2 h, até 2 h, ou já em curso. Gatilho atingido por chuva observada conta como até 2 h."],
          ["3", "O que a população precisa fazer?", "Preparar-se, ir para local seguro / ponto de apoio, ou evacuar já."],
        ].map(([n, t, x]) => (
          <div key={n} className={card}>
            <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{n}</span>
            <b className="block text-sm text-gray-800">{t}</b>
            <p className="mt-0.5 text-xs text-gray-600">{x}</p>
          </div>
        ))}
        <span className="flex items-center justify-center text-xl font-bold text-gray-400">=</span>
        <div className={`${card} flex flex-col justify-center`}>
          <b className="text-sm text-gray-800">Nível</b>
          <p className="mt-0.5 text-xs text-gray-600"><b>Alto</b> (&gt; 2 h) · <b>Severo</b> (até 2 h, área delimitada) · <b>Extremo</b> (em curso)</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`${card} border-t-4`} style={{ borderTopColor: ESCALA_NM[4].cor }}>
          <h4 className="mb-1.5 text-sm font-bold text-gray-800">Condições para o Severo (item 2.5.1), todas juntas</h4>
          <Lista cor={ESCALA_NM[4].cor} itens={[
            "Gatilho alto ou muito alto atingido por chuva observada, ou fenômeno súbito já detectado (radar, descargas, estações) e acompanhado em nowcasting",
            "Impacto esperado em até 2 horas",
            "Área delimitada (polígono, de preferência KMZ da COMDEC) com população exposta",
            "Ação de autoproteção escrita na mensagem",
            "Aviso à COMDEC e à REDEC e aprovação do Diretor ou do Oficial de Ligação",
          ]} />
        </div>
        <div className={`${card} border-t-4 border-t-red-600`}>
          <h4 className="mb-1.5 text-sm font-bold text-gray-800">Nunca é Severo</h4>
          <Lista cor="#dc2626" itens={[
            "Previsão genérica ou regional, ou com mais de 2 h de antecedência",
            "Risco apenas previsto, sem gatilho atingido (hidrologia e geologia)",
            "Baixa umidade, ondas de calor e de frio, ressaca: evolução lenta, no máximo NM 3",
            "Sem área delimitada: fica em NM 3 até haver polígono",
          ]} />
        </div>
      </div>
      {onAssistente && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
          <p className="text-xs text-gray-600"><b className="text-gray-800">Assistente de decisão.</b> Marque a situação e veja o nível, as ferramentas permitidas e o que fazer antes de enviar. Ele aplica as regras do PLANCON; a decisão final é do técnico responsável e da aprovação prevista no item 2.6.4.</p>
          <button type="button" onClick={onAssistente} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Abrir o assistente em “Lançar nível”</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 4. fluxo do envio

const FLUXO: [string, string, string][] = [
  ["Identificar o nível", "Aplicar a regra das 2 h e o item 2.5.1 (use o assistente). Conferir se o município é autônomo para DCA.", "Técnico de plantão (meteorologia, hidrologia ou geologia)"],
  ["Checar as cinco condições do Severo", "Gatilho atingido ou fenômeno detectado · até 2 h · área delimitada · ação de autoproteção · aviso e aprovação. Faltou uma: fica em NM 3.", "Técnico de plantão"],
  ["Delimitar a área", "Usar o polígono KMZ da COMDEC; sem ele, desenhar sobre as áreas mapeadas de risco alto e muito alto. Para meteorologia, usar a trajetória do sistema.", "Técnico de plantão"],
  ["Escrever a minuta", "Modelo da seção Mensagens. Postar no Telegram “04 CEMADEN-RJ IDAP SMS” com nível, risco, município, localidade/polígono e texto.", "Técnico de plantão"],
  ["Obter aprovação", "Diretor do CEMADEN-RJ ou quem ele indicar, preferencialmente o Oficial de Ligação, inclusive fora do expediente.", "Diretor / Oficial de Ligação"],
  ["Avisar a COMDEC e a REDEC", "Por telefone e pelo grupo operacional: nível, área, horário previsto do envio e texto. Registrar a tentativa e o horário no livro do plantão.", "Técnico / operador"],
  ["Cadastrar na Idap", "Conta individual de quem envia (nunca compartilhada). Campos na seção Campos da Idap. Marcar DCA e TV por assinatura.", "Usuário Idap habilitado"],
  ["Registrar e informar", "Registrar nível, ferramentas, municípios, horário e responsável; informar o CESTAD, o Grupo de WhatsApp Operacional SEDEC-RJ e a REDEC.", "Técnico / operador"],
  ["Acompanhar, atualizar, encerrar", "Mudou nível, área ou vigência: atualizar o alerta (CAP). Voltou à normalidade: cancelar ou encerrar o alerta, sem criar alerta novo.", "Técnico de plantão"],
];

function Fluxo() {
  return (
    <div className="space-y-3">
      <Titulo sub="Nove passos, na ordem. Os passos 4 a 6 podem correr em paralelo quando o tempo é curto, mas nenhum pode ser pulado; no NM 5 o aviso ao município pode ser simultâneo ao envio, com o motivo registrado.">Fluxo do envio de Severo e Extremo (DCA)</Titulo>
      <ol className="space-y-2">
        {FLUXO.map(([t, x, q], i) => (
          <li key={t} className={`${card} flex gap-3`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</span>
            <div className="min-w-0">
              <b className="text-sm text-gray-800">{t}</b>
              <p className="mt-0.5 text-xs text-gray-600">{x}</p>
              <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{q}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- 5. por equipe

type Equipe = "met" | "hid" | "geo";

const EQ_LINHAS: Record<Equipe, string[][]> = {
  met: [
    ["SMS + TV junto com aviso de “chuva nos próximos dias”", "Aviso com dias de antecedência vai por boletim e painel, sem alerta Idap", "Alerta só com iminência ou ocorrência (art. 8º)"],
    ["SMS a partir de severidade moderada, sem critério de tempo", "Alerta a partir do NM 2, com evento esperado nas próximas horas ou em curso", "Arts. 8º e 12"],
    ["TV por assinatura com severidade “muito alta”", "TV só em NM 4 Severo ou NM 5 Extremo", "Art. 13, § 2º"],
    ["Cell Broadcast só com ventos > 100 km/h, chuva > 70 mm/h, tornado", "Esses casos em curso são NM 5. Severo já a partir da severidade alta para fenômenos súbitos detectados", "Item 2.5.1"],
    ["Campo “Confiança: Possível”", "Severo e Extremo exigem alto grau de confiabilidade: sistema já detectado", "Art. 17, § 1º"],
    ["SMS de baixa umidade < 30%", "Fora do PLANCON de chuvas intensas; nunca Severo", "Evolução lenta"],
  ],
  hid: [
    ["SMS de permanência de risco muito alto, validade 24 h, como “severidade muito alta”", "Alerta Alto (NM 3), sem TV e sem DCA, atualizado a cada mudança", "Previsão > 2 h não pode ser Severo"],
    ["CBS Severo só com risco hidrológico muito alto, “antecipado, nas próximas horas”", "NM 4 com gatilho alto ou muito alto atingido e impacto em até 2 h", "Item 2.5.1"],
    ["CBS Extremo com antecedência < 10 min", "NM 5 para evento em curso, agravamento ou confirmação in loco da COMDEC", "Mantido"],
    ["Risco moderado sem regra definida", "Só para COMDEC e REDEC, sem alerta à população", "Anexo III-5"],
  ],
  geo: [
    ["Recomendação de mobilização de sirenes = risco alto, sem alerta à população no celular", "Recomendação de mobilização = NM 4 Severo para as áreas das estações", "A sirene já manda ir ao ponto de apoio: é autoproteção imediata"],
    ["“Município com SRAAS não recebe CBS Severo”", "Sirene e DCA são complementares; DCA pode ir também onde há sirene", "Item 2.6.8"],
    ["CBS Severo com previsão de gatilho muito alto", "Previsão sem gatilho atingido fica em NM 3 Alto, sem DCA", "Exige alto grau de confiabilidade"],
    ["CBS Extremo só após evolução depois da mobilização", "Mantido: agravamento após mobilização ou ocorrências confirmadas = NM 5", "Item 2.5"],
    ["SMS de permanência de risco muito alto", "Alerta Alto (NM 3), atualizado ou encerrado no padrão CAP", "Previsão > 2 h"],
  ],
};

function CartaoNivel({ n, titulo, children }: { n: number; titulo?: string; children: ReactNode }) {
  return (
    <div className={`${card} border-t-4`} style={{ borderTopColor: ESCALA_NM[n].cor }}>
      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">{titulo ?? `${ESCALA_NM[n].sigla} ${ESCALA_NM[n].nome}`}</h4>
      {children}
    </div>
  );
}

function Equipes() {
  const [eq, setEq] = useState<Equipe>("met");
  return (
    <div className="space-y-3">
      <Titulo sub="O que se fazia até a temporada 2025/2026 e o que passa a valer.">O que muda na rotina de cada equipe</Titulo>
      <div className="flex flex-wrap gap-1" role="tablist">
        {([["met", "Meteorologia"], ["hid", "Hidrologia"], ["geo", "Geologia"]] as [Equipe, string][]).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={eq === k} onClick={() => setEq(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${eq === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{t}</button>
        ))}
      </div>
      <Tabela cabecalho={["Antes", "Agora", "Por quê"]} linhas={EQ_LINHAS[eq]} />
      {eq === "met" && (
        <div className="grid gap-3 md:grid-cols-3">
          <CartaoNivel n={4} titulo="Pode chegar a NM 4">
            <Lista cor={ESCALA_NM[4].cor} itens={["Vendaval a partir de 52 km/h sobre área urbana densa", "Chuva > 50 mm/h sobre área sem monitoramento hidro/geo", "Granizo de célula com trajetória definida", "Raios e rajadas sobre aglomerações e grandes eventos", "Indícios de tornado ou microexplosão"]} />
          </CartaoNivel>
          <CartaoNivel n={5}>
            <Lista cor={ESCALA_NM[5].cor} itens={["Tornado confirmado", "Rajadas > 100 km/h em curso", "Chuva > 70 mm/h em curso sobre área urbana com ocorrências"]} />
          </CartaoNivel>
          <CartaoNivel n={3} titulo="Máximo NM 3">
            <Lista cor={ESCALA_NM[3].cor} itens={["Baixa umidade do ar", "Ondas de calor e de frio", "Ressaca", "Chuva forte em área com monitoramento hidro/geo: o nível vem da hidrologia ou da geologia"]} />
          </CartaoNivel>
        </div>
      )}
      {eq === "hid" && (
        <div className="grid gap-3 md:grid-cols-3">
          <CartaoNivel n={3}><p className="text-xs text-gray-700">Risco alto ou muito alto previsto com mais de 2 h. Lâmina d&apos;água 0,30–0,40 m prevista, rios subindo.</p></CartaoNivel>
          <CartaoNivel n={4}><p className="text-xs text-gray-700">Gatilho de 15 min, 30 min ou 1 h atingido, transbordamento esperado em até 2 h em comunidades ribeirinhas delimitadas.</p></CartaoNivel>
          <CartaoNivel n={5}><p className="text-xs text-gray-700">Inundação ou enxurrada <b>em curso</b>, núcleo estacionário ou confirmação de campo pela COMDEC.</p></CartaoNivel>
        </div>
      )}
      {eq === "geo" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className={card}>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-600">Municípios autônomos</h4>
            <p className="text-xs text-gray-700"><b>Para DCA:</b> Angra dos Reis, Petrópolis e Rio de Janeiro — o envio é deles; o CEMADEN-RJ recomenda envio nas mesmas condições.</p>
            <p className="mt-1 text-xs text-gray-700"><b>Para sirenes:</b> Angra dos Reis, Mangaratiba, Niterói e Rio de Janeiro.</p>
          </div>
          <div className={card}>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-600">Polígono</h4>
            <p className="text-xs text-gray-700">Sem KMZ da COMDEC, delimitar pelos setores de risco alto e muito alto mapeados. Sem área delimitada não há Severo.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 6. campos da Idap

function Idap() {
  const linhas: ReactNode[][] = [
    ["Nível / severidade", "Moderado", "Alto", "Severo", "Extremo"],
    ["Urgência", "Esperado", "Esperado", "Esperado", "Imediata"],
    ["Confiança", "Provável", "Provável", "Observada ou provável, com alto grau de confiabilidade", "Observada"],
    ["Ação necessária", "Preparar / evitar", "Preparar / evitar", "Abrigar / executar (autoproteção)", "Evacuar / abrigar"],
    ["SMS (146 caracteres)", "Opcional", "Sim", "Sim", "Sim"],
    ["TV por assinatura (62 caracteres)", "Não", "Não", "Sim", "Sim"],
    ["DCA (Cell Broadcast)", "Não", "Não", "Sim", "Sim"],
    ["Localização", "Município", "Município", "Polígono da área", "Polígono da área"],
  ];
  return (
    <div className="space-y-3">
      <Titulo sub="Referência rápida para o cadastro. Os nomes dos campos seguem o Procedimento 01 da Meteorologia; confira na tela atual da Idap, que pode ter mudado com a Portaria.">Como preencher a Idap por nível</Titulo>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className={tabela}>
          <thead className={cab}>
            <tr>
              <th className={th}>Campo</th>
              {[2, 3, 4, 5].map((n) => <th key={n} className={th}><Chip n={n} /></th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                {l.map((c, j) => <td key={j} className={j === 0 ? `${td} font-medium` : td}>{c}</td>)}
              </tr>
            ))}
            <tr className="border-t border-gray-100">
              <td className={`${td} font-medium`}>Vigência</td>
              <td className={td} colSpan={4}>A do aviso ou alerta técnico que originou, até 24 h; atualizar a cada mudança e encerrar ao fim (CAP)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Aviso tom="ambar"><b>Atenção:</b> na Idap, marcar “abrigar”, “evacuar” ou “executar” em Ação necessária faz o sistema gerar Cell Broadcast. Em NM 2 e NM 3, use apenas “preparar” ou “evitar”.</Aviso>
    </div>
  );
}

// ---------------------------------------------------------------- 7. mensagens modelo

type Msg = { nm: number | null; canal: string; lim: number | null; t: string };
const MSG: Record<string, Msg[]> = {
  geo: [
    { nm: 3, canal: "SMS", lim: 146, t: "Defesa Civil RJ: ALERTA ALTO de deslizamentos em [MUNICÍPIO]. Moradores de encostas: fiquem atentos e prontos para sair. Emergência: 199." },
    { nm: 4, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA SEVERO de deslizamentos em [LOCALIDADES], [MUNICÍPIO]. Saia das áreas de encosta e vá para o ponto de apoio. Emergência: 199 ou 193." },
    { nm: 4, canal: "TV", lim: 62, t: "ALERTA SEVERO: deslizamentos em [MUNICÍPIO]. Saia da encosta." },
    { nm: 5, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA EXTREMO de deslizamentos em [LOCALIDADE], [MUNICÍPIO]. Evacue imediatamente e vá para o ponto de apoio. Emergência: 199 ou 193." },
  ],
  hid: [
    { nm: 3, canal: "SMS", lim: 146, t: "Defesa Civil RJ: ALERTA ALTO de alagamentos e inundações em [MUNICÍPIO]. Evite rios e córregos e acompanhe a Defesa Civil. Emergência: 199." },
    { nm: 4, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA SEVERO de inundação em [BAIRROS], [MUNICÍPIO], nas próximas 2 horas. Saia das margens dos rios e vá para local alto e seguro. Emergência: 199 ou 193." },
    { nm: 4, canal: "TV", lim: 62, t: "ALERTA SEVERO: inundação em [MUNICÍPIO]. Vá para local alto." },
    { nm: 5, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA EXTREMO. Inundação em curso em [LOCAL], [MUNICÍPIO]. Saia agora para local alto e seguro. Não atravesse áreas alagadas. Emergência: 193." },
  ],
  met: [
    { nm: 2, canal: "SMS", lim: 146, t: "Defesa Civil RJ: chuva forte nas próximas horas em [MUNICÍPIO]. Evite áreas de risco e alagadas. Emergência: 199." },
    { nm: 3, canal: "SMS", lim: 146, t: "Defesa Civil RJ: ALERTA ALTO de chuva forte a muito forte em [MUNICÍPIO] a partir das [HH]h. Prepare-se e evite encostas e rios. Emergência: 199." },
    { nm: 4, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA SEVERO de ventania forte em [MUNICÍPIO] na próxima hora. Abrigue-se em local seguro, longe de árvores e da fiação. Emergência: 199 ou 193." },
    { nm: 5, canal: "DCA", lim: null, t: "Defesa Civil RJ: ALERTA EXTREMO. Temporal com ventos destrutivos agora em [LOCAL]. Abrigue-se já em cômodo interno, longe de janelas. Emergência: 193." },
  ],
  fim: [
    { nm: null, canal: "Atualização CAP", lim: 146, t: "Defesa Civil RJ: encerrado o alerta de [RISCO] em [MUNICÍPIO]. Siga as orientações da Defesa Civil municipal." },
    { nm: null, canal: "Atualização CAP", lim: 146, t: "Defesa Civil RJ: o alerta de [RISCO] em [MUNICÍPIO] passou para [NÍVEL]. [AÇÃO]. Emergência: 199." },
  ],
};

function CartaoMensagem({ m }: { m: Msg }) {
  const [texto, setTexto] = useState(m.t);
  const [copiado, setCopiado] = useState(false);
  const n = texto.length;
  const estourou = m.lim !== null && n > m.lim;
  const e = m.nm !== null ? ESCALA_NM[m.nm] : null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem permissão de área de transferência: o texto continua selecionável */
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5" style={e ? { background: e.cor, color: corTextoSobre(e.cor) } : { background: "#f3f4f6" }}>
        <b className="text-xs">{e ? `${e.sigla} ${e.nome}` : "Encerramento / mudança"}</b>
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-gray-800">{m.canal}</span>
      </div>
      <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={4} aria-label={`Mensagem ${m.canal}`} className="block w-full resize-y border-0 p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5 text-[11px]">
        <span className={estourou ? "font-semibold text-red-600" : "text-gray-500"}>
          {m.lim !== null ? (estourou ? `${n} / ${m.lim} caracteres — reduza` : `${n} / ${m.lim} caracteres`) : `${n} caracteres · limite do DCA a confirmar`}
        </span>
        <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50">
          {copiado ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function Mensagens() {
  const [eq, setEq] = useState("geo");
  return (
    <div className="space-y-3">
      <Titulo sub={<><b>Proposta para validação da Direção.</b> Seguem o padrão do POP atual (“Defesa Civil RJ: alerta… ação… emergência”). Troque os campos entre colchetes; o contador avisa quando passa do limite. O limite de caracteres do DCA na Idap ainda precisa ser confirmado.</>}>Mensagens modelo</Titulo>
      <div className="flex flex-wrap gap-1" role="tablist">
        {[["geo", "Geologia"], ["hid", "Hidrologia"], ["met", "Meteorologia"], ["fim", "Encerramento"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={eq === k} onClick={() => setEq(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${eq === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{t}</button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {MSG[eq].map((m, i) => <CartaoMensagem key={`${eq}-${i}`} m={m} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 8. proibido

const PROIBIDO: [string, string][] = [
  ["Severo para previsão genérica", "Nem com mais de 2 h de antecedência (art. 12, parágrafo único)."],
  ["TV ou DCA em NM 2 e NM 3", "Inclui marcar abrigar/evacuar/executar, que gera DCA (art. 13)."],
  ["Senha compartilhada", "Cadastro e credencial são individuais; revalidação semestral (arts. 3º e 4º)."],
  ["Mensagem imprecisa ou fora do tema", "Nada político, publicitário, discriminatório ou sobre gestão pública (art. 16)."],
  ["Alerta novo para “fim do alerta”", "Encerrar ou cancelar o alerta existente (padrão CAP, art. 10)."],
  ["Simulado com canal real sem pedido", "Pedir à SEDEC/MIDR com 20 dias de antecedência (art. 22)."],
];

function Proibido() {
  return (
    <div className="space-y-3">
      <Titulo sub="Cada item pode levar à revogação do cadastro do usuário na Idap (art. 24).">Proibido pela Portaria ou pelo PLANCON</Titulo>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PROIBIDO.map(([t, x]) => (
          <div key={t} className={`${card} border-t-4 border-t-red-600`}>
            <b className="text-sm text-gray-800">{t}</b>
            <p className="mt-0.5 text-xs text-gray-600">{x}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 9. checklist (marcações só neste navegador)

const CHECK_KEY = "guia-plantao-checklist";
const CHECKLIST: [string, string[]][] = [
  ["Início do turno", ["Login individual na Idap funcionando", "NM vigente por município conferido no painel", "Alertas Idap ativos revisados (vigência, área)", "Contatos de COMDEC, REDEC, Diretor e Oficial de Ligação à mão", "Polígonos KMZ das áreas de risco disponíveis"]],
  ["Antes de Severo ou Extremo", ["Gatilho atingido ou fenômeno detectado", "Impacto em até 2 h (ou em curso)", "Área delimitada com população exposta", "Minuta postada no Telegram 04", "Aprovação do Diretor / Oficial de Ligação", "COMDEC e REDEC avisadas; horário registrado"]],
  ["Depois do envio", ["Registro: nível, ferramentas, municípios, horário, responsável", "CESTAD, grupo operacional e REDEC informados", "Alerta atualizado a cada mudança de cenário", "Alerta encerrado ou cancelado ao fim"]],
];

function Checklist() {
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMarcas(salvo && typeof salvo === "object" ? salvo : {});
    } catch {
      /* sem armazenamento local: o checklist funciona só nesta sessão */
    }
  }, []);
  const gravar = (prox: Record<string, boolean>) => {
    setMarcas(prox);
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(prox));
    } catch {
      /* idem */
    }
  };
  return (
    <div className="space-y-3">
      <Titulo sub="As marcações ficam salvas só neste navegador; servem de lembrete, não de registro oficial.">Checklist do plantão</Titulo>
      <div className="grid gap-3 md:grid-cols-3">
        {CHECKLIST.map(([titulo, itens]) => (
          <div key={titulo} className={card}>
            <h4 className="mb-2 text-sm font-bold text-gray-800">{titulo}</h4>
            <ul className="space-y-1.5">
              {itens.map((t) => {
                const id = `${titulo}|${t}`;
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-700">
                      <input type="checkbox" className="mt-0.5" checked={!!marcas[id]} onChange={(e) => gravar({ ...marcas, [id]: e.target.checked })} />
                      <span className={marcas[id] ? "text-gray-400 line-through" : ""}>{t}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => gravar({})} className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Limpar marcações</button>
    </div>
  );
}

// ---------------------------------------------------------------- guia

export default function GuiaPlantao({ onAssistente }: { onAssistente?: () => void }) {
  const [secao, setSecao] = useState<Secao>("mudou");
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-800">Guia do Plantão: novos Níveis de Monitoramento e Defesa Civil Alerta</h2>
        <p className="text-xs text-gray-500">Passo a passo para meteorologia, hidrologia e geologia aplicarem a Portaria MIDR nº 2.458/2026: como escolher o nível, quando o Severo e o Extremo podem ir para o celular (DCA) e o que muda na rotina de cada equipe.</p>
        <p className="mt-1 text-[11px] text-gray-400">Base: Portaria MIDR nº 2.458/2026 (DOU 03/08/2026) e PLANCON 2026/2027, itens 2.5, 2.5.1, 2.6 e Anexo III · Versão: 28/10/2026 · para capacitação das equipes · mensagens modelo: proposta, sujeita à validação da Direção</p>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Seções do guia">
        {SECOES.map(([k, t], i) => (
          <button key={k} type="button" role="tab" aria-selected={secao === k} onClick={() => setSecao(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${secao === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {i + 1}. {t}
          </button>
        ))}
      </div>
      <section aria-label={SECOES.find(([k]) => k === secao)?.[1]}>
        {secao === "mudou" && <Mudou />}
        {secao === "niveis" && <Niveis />}
        {secao === "duashoras" && <DuasHoras onAssistente={onAssistente} />}
        {secao === "fluxo" && <Fluxo />}
        {secao === "equipes" && <Equipes />}
        {secao === "idap" && <Idap />}
        {secao === "mensagens" && <Mensagens />}
        {secao === "proibido" && <Proibido />}
        {secao === "checklist" && <Checklist />}
      </section>
      <p className="border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
        Fontes: Portaria MIDR nº 2.458, de 30/07/2026 (DOU 03/08/2026, Ed. 144-A, Seção 1 – Extra A, p. 7); PLANCON 2026/2027 – texto novo (itens 2.5, 2.5.1, 2.6, 3.1.1 e Anexo III); Procedimentos da Equipe de Geologia 2025 (POP do CBS); Protocolo de Meteorologia 2025; Protocolo de Alertas Hidrológicos; Tabelas de risco 2025/2026 do CEMADEN-RJ.
      </p>
    </div>
  );
}
