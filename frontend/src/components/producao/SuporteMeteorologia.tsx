"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

/** Suporte de Meteorologia (Protocolo 2026, procedimentos 01 e 09): passo a passo do Idap, Cell Broadcast (níveis, cenários, modelo da mensagem) e a
 * tabela de níveis de severidade meteorológica. Só conteúdo de apoio (sem dados do banco). Aparece apenas com `NEXT_PUBLIC_MET_EXPERIMENTAL=1`:
 * feito localmente, ainda não publicado. */

const COR: Record<string, string> = { verde: "#16a34a", amarelo: "#eab308", laranja: "#f97316", vermelho: "#dc2626", roxo: "#7e22ce" };

const IDAP_CAMPOS: [string, string][] = [
  ["Severidade", "Alta ou Muito Alta"],
  ["Forma de envio", "SMS e TV"],
  ["Categoria do evento", "Chuvas Intensas"],
  ["Urgência", "Esperado"],
  ["Confiança", "Possível"],
  ["Ação necessária", "evacuar, executar, abrigar, preparar, evitar, observar ou nenhuma ação"],
  ["Começo da vigência", "Agora"],
  ["Período da vigência", "Confirmar com a meteorologista"],
  ["Localização", "Município · UF: Rio de Janeiro · Município: os enviados pela meteorologista"],
];

const CB_NIVEIS = [
  { nivel: "Severo", urgencia: "Esperado", confianca: "Provável ou observado", acao: "Executar", criterio: "Preparação para evacuação ou abrigamento; possibilidade de evento adverso severo nas próximas horas (nowcasting); ameaça esperada à integridade física ou à propriedade." },
  { nivel: "Extremo", urgencia: "Imediato", confianca: "Provável ou observado", acao: "Evacuar ou abrigar", criterio: "Exige plano de contingência ou alinhamento com os atores locais; evacuação imediata de áreas de risco; extrema e imediata ameaça à vida." },
];
const CB_CENARIOS = [
  { cenario: "Cenário 1 — chuva intensa", urgencia: "Esperada (próxima hora)", confianca: "Provável (> 50%)", nivel: "Alerta Severo", criterios: "Alerta do INMET perigo/grande perigo · risco hidrológico ou de movimento de massa ALTO/MUITO ALTO (CEMADEN) · aviso de impacto excepcional · núcleo de chuva intensa com taxa mínima de 40 mm/h, persistente sobre a região ou esperado em 1 h para outra · análise final da meteorologia da CEPDEC e polígono de envio." },
  { cenario: "Cenário 2 — movimento de massa, enxurrada e inundação", urgencia: "Esperada (próxima hora)", confianca: "Observada", nivel: "Alerta Severo", criterios: "Risco ALTO/MUITO ALTO do CEMADEN · núcleo de chuva com mínimo de 40 mm/h · análise final e polígono · e/ou constatação da COMPDEC ou REPDEC de que o evento ocorre." },
  { cenario: "Enxurrada e inundação", urgencia: "Imediata (< 10 min)", confianca: "Observada", nivel: "Alerta Extremo", criterios: "Fenômeno meteorológico EXTREMO observado pelo monitoramento da CEPDEC (radar, satélite e estações) e polígono de envio · e/ou constatação da COMPDEC ou REPDEC." },
  { cenario: "Movimento de massa", urgencia: "Imediata (< 10 min)", confianca: "Observada", nivel: "Alerta Extremo", criterios: "Risco de movimento de massa ALTO/MUITO ALTO (CEMADEN) · fenômeno EXTREMO observado pela CEPDEC · e/ou sinais de movimentação de massa constatados pela COMPDEC ou REPDEC." },
];
const CB_MODELO: [string, string][] = [
  ["Instituição", "CEMADEN-RJ"],
  ["Possibilidade de desastre", "Alerta de chuva · rajadas de vento · alagamento · inundação · enxurrada · deslizamento"],
  ["Intensidade", "FORTE/MUITO FORTE"],
  ["Local", "no município de… · na bacia do rio… · nos morros… · na comunidade… · na sua localidade…"],
  ["Risco", "de destelhamento · alagamento · inundação · enxurrada · deslizamento"],
  ["Ação necessária", "Evitar áreas de risco · Dirija-se para pontos de apoio · Evacue imediatamente · Siga rotas de fuga"],
  ["Recomendação final", "Proteja-se · Fique atento às orientações da Defesa Civil do seu município"],
  ["Contatos", "Emergência ligue 199 ou 193"],
];
const CB_EXEMPLOS = [
  "Defesa Civil RJ: Alerta para chuva forte/muito forte no município de Rio Claro. Abrigue-se. Emergência, ligue 199.",
  "Defesa Civil RJ: Alerta para alagamentos e inundações no município de Teresópolis. Mantenha-se em local seguro. Emergência, ligue 199.",
  "Defesa Civil RJ: Alerta de DESLIZAMENTOS em Barra do Piraí (morro do Chalet). Evacue imediatamente. Emergência ligue 199 ou 193",
];

type Linha = { nivel: string; evento: string; acao: string; cor: string };
const SEVERIDADE: Linha[] = [
  { nivel: "MUITO BAIXO", cor: "verde", evento: "Sem chuva ou evento significativo; chuvisco ou chuva fraca (< 5 mm/h)", acao: "Sem ações. Acompanhar a previsão das próximas 24 h." },
  { nivel: "BAIXO", cor: "amarelo", evento: "Chuva moderada (5 a 24,9 mm/h) ou previsão de curto prazo de chuva forte (25 a 49,9 mm/h); umidade < 40%", acao: "Verificar avisos vigentes da defesa civil do município. Acompanhar a previsão." },
  { nivel: "MODERADO", cor: "laranja", evento: "Chuva forte (25 a 49,9 mm/h) ou previsão de chuva muito forte (> 50 mm/h)", acao: "Verificar avisos vigentes da defesa civil do município. Acompanhar a previsão." },
  { nivel: "MODERADO", cor: "laranja", evento: "Previsão ou ocorrência de granizo", acao: "Não se abrigar sob árvores nem em coberturas frágeis; abrigar-se em local coberto e seguro." },
  { nivel: "MODERADO", cor: "laranja", evento: "Rajadas de vento moderado a forte", acao: "Evitar árvores, torres, fiações e placas; não estacionar perto." },
  { nivel: "MODERADO", cor: "laranja", evento: "Umidade relativa < 30%", acao: "Evitar exercício ao ar livre entre 11 e 15 h; locais protegidos do sol; umidificar o ambiente." },
  { nivel: "MODERADO", cor: "laranja", evento: "Ressaca", acao: "Evitar banho de mar, esportes no mar, mirantes na orla e navegar." },
  { nivel: "MODERADO", cor: "laranja", evento: "Declínio ou elevação acentuada da temperatura (a definir)", acao: "Verificar avisos vigentes. Acompanhar a previsão." },
  { nivel: "MODERADO", cor: "laranja", evento: "Raio", acao: "Evitar áreas descampadas, árvores, cercas, torres e objetos metálicos; não usar equipamentos ligados à rede elétrica." },
  { nivel: "ALTO", cor: "vermelho", evento: "Chuva muito forte (> 50 mm/h)", acao: "Verificar avisos vigentes da defesa civil do município. Acompanhar a previsão." },
  { nivel: "ALTO", cor: "vermelho", evento: "Rajadas de vento forte (52 a 76 km/h)", acao: "Abrigar-se em local coberto e seguro; sem esportes ao ar livre ou no mar; não ficar sob árvores, outdoors ou fiação." },
  { nivel: "ALTO", cor: "vermelho", evento: "Umidade relativa < 20%", acao: "Sem exercícios entre 10 e 16 h; evitar aglomerações em locais fechados; soro fisiológico para olhos e narinas." },
  { nivel: "ALTO", cor: "vermelho", evento: "Onda de calor", acao: "Sem exercícios e trabalho ao ar livre entre 10 e 16 h; muita água; evitar sol e ambientes sem ventilação." },
  { nivel: "ALTO", cor: "vermelho", evento: "Onda de frio", acao: "Ambientes arejados; evitar locais desprotegidos nas horas mais frias; agasalhos e alimentação adequada." },
  { nivel: "MUITO ALTO", cor: "roxo", evento: "Chuva muito forte (> 70 mm/h)", acao: "Verificar avisos vigentes da defesa civil do município. Acompanhar a previsão." },
  { nivel: "MUITO ALTO", cor: "roxo", evento: "Rajadas de vento muito forte ou mais intenso (> 76 km/h)", acao: "Abrigar-se em local coberto e seguro; sem esportes ao ar livre ou no mar; não ficar sob árvores, outdoors ou fiação." },
  { nivel: "MUITO ALTO", cor: "roxo", evento: "Umidade relativa < 12%", acao: "Interromper atividades ao ar livre entre 10 e 16 h; suspender atividades com aglomeração em recintos fechados; umidificar ambientes." },
];

function Contador({ limite, rotulo }: { limite: number; rotulo: string }) {
  const [t, setT] = useState("");
  const [ok, setOk] = useState(false);
  return (
    <label className="block text-xs">
      <span className="flex justify-between">
        <span className="font-semibold">{rotulo}</span>
        <span className={t.length > limite ? "font-bold text-red-600" : "text-gray-500"}>{t.length}/{limite}{t.length > limite ? " — passou, avise a meteorologista" : ""}</span>
      </span>
      <textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} placeholder="Cole aqui o texto enviado pela meteorologista" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
      <button
        type="button"
        disabled={!t}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(t);
            setOk(true);
            setTimeout(() => setOk(false), 2000);
          } catch {
            /* sem permissão para a área de transferência */
          }
        }}
        className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-semibold hover:bg-gray-50 disabled:opacity-50"
      >
        {ok ? <Check size={12} /> : <Clipboard size={12} />} {ok ? "Copiado" : "Copiar"}
      </button>
    </label>
  );
}

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <h2 className="mb-2 text-sm font-bold">{titulo}</h2>
    {children}
  </section>
);

export default function SuporteMeteorologia() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <p className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">Versão de teste local (ainda não publicada). Conteúdo do Protocolo de Meteorologia 2026, procedimentos 01 e 09.</p>

      <Secao titulo="Idap — SMS e TV por assinatura">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-gray-700">
          <li>Entrar em idap.mdr.gov.br com o seu CPF e senha (intransferíveis).</li>
          <li>Menu Alertas → “+ Adicionar Novo Alerta”. Para ver o que já foi enviado: Alertas → Listar.</li>
          <li>Preencher os campos abaixo. Só municípios <b>não autônomos</b> (a diretoria repassa a lista).</li>
          <li>Se marcar ação <b>abrigar, evacuar ou executar</b>, o produto gerado é o <b>Cell Broadcast</b>, não o SMS.</li>
          <li>Apagar qualquer texto que já esteja nos campos e colar o enviado pela meteorologista; conferir se coube.</li>
          <li>Esperar o “ok” do diretor ou subdiretor; clicar em Enviar, conferir, digitar a senha de novo e enviar.</li>
        </ol>
        <table className="mb-3 w-full text-xs">
          <tbody>
            {IDAP_CAMPOS.map(([c, v]) => (
              <tr key={c} className="border-t border-gray-100">
                <td className="w-44 py-1 pr-2 font-semibold">{c}</td>
                <td className="py-1 text-gray-700">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-3 sm:grid-cols-2">
          <Contador limite={146} rotulo="Mensagem SMS (até 146 caracteres)" />
          <Contador limite={62} rotulo="Mensagem TV (até 62 caracteres; só severidade MUITO ALTA)" />
        </div>
      </Secao>

      <Secao titulo="Cell Broadcast (Defesa Civil Alerta)">
        <p className="mb-2 text-xs text-gray-700">Enviado <b>apenas pela meteorologista de plantão</b>, do tipo SEVERO (nowcasting: minutos até 1 h antes do evento). Sem cadastro prévio e sem custo para o usuário.</p>
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 text-left"><th className="p-1.5">Nível</th><th className="p-1.5">Urgência</th><th className="p-1.5">Confiança</th><th className="p-1.5">Ação</th><th className="p-1.5">Critérios de uso</th></tr></thead>
            <tbody>
              {CB_NIVEIS.map((n) => (
                <tr key={n.nivel} className="border-t border-gray-100 align-top"><td className="p-1.5 font-bold">{n.nivel}</td><td className="p-1.5">{n.urgencia}</td><td className="p-1.5">{n.confianca}</td><td className="p-1.5">{n.acao}</td><td className="p-1.5">{n.criterio}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-1 text-xs font-bold">Quando enviar (orientações de envio)</h3>
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 text-left"><th className="p-1.5">Cenário</th><th className="p-1.5">Urgência</th><th className="p-1.5">Confiança</th><th className="p-1.5">Nível</th><th className="p-1.5">Critérios</th></tr></thead>
            <tbody>
              {CB_CENARIOS.map((c) => (
                <tr key={c.cenario} className="border-t border-gray-100 align-top"><td className="p-1.5 font-semibold">{c.cenario}</td><td className="p-1.5">{c.urgencia}</td><td className="p-1.5">{c.confianca}</td><td className="p-1.5 font-bold">{c.nivel}</td><td className="p-1.5">{c.criterios}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-1 text-xs font-bold">Modelo da mensagem — Defesa Civil Alerta (CEMADEN-RJ)</h3>
        <table className="mb-2 w-full text-xs">
          <tbody>
            {CB_MODELO.map(([c, v]) => (
              <tr key={c} className="border-t border-gray-100"><td className="w-44 py-1 pr-2 font-semibold">{c}</td><td className="py-1 text-gray-700">{v}</td></tr>
            ))}
          </tbody>
        </table>
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-700">{CB_EXEMPLOS.map((e) => <li key={e}>{e}</li>)}</ul>
      </Secao>

      <Secao titulo="Níveis de severidade meteorológica">
        <p className="mb-2 text-xs text-gray-700">A meteorologista altera os níveis conforme o registro das estações meteorológicas e pluviométricas.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 text-left"><th className="p-1.5">Nível</th><th className="p-1.5">Evento ou efeito esperado</th><th className="p-1.5">Ações recomendadas</th></tr></thead>
            <tbody>
              {SEVERIDADE.map((l, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap p-1.5"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COR[l.cor] }} /><b>{l.nivel}</b></td>
                  <td className="p-1.5">{l.evento}</td>
                  <td className="p-1.5 text-gray-700">{l.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Divergência a decidir: rajada “muito forte” aparece como &gt; 76 km/h aqui e como 100 km/h no Cell Broadcast; as escalas de chuva (aviso, sirenes, severidade) também diferem.</p>
      </Secao>
    </div>
  );
}
