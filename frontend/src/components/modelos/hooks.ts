"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchGrade,
  fetchMeta,
  Geo,
  Grade,
  horaMaisProxima,
  MetaModelo,
  ModeloGrade,
  Produto,
  produtoPadraoGrade,
  produtosDoModelo,
  ResultadoProduto,
  runParaMs,
} from "@/lib/modelosGrade";
import { CONTORNOS_DEF, contornos as calcularContornos, NivelContorno } from "@/lib/modelosExtras";

/** Carrega o catálogo (`meta.json`) do modelo escolhido. */
export function useMetaModelo(modelo: ModeloGrade | null) {
  const [estado, setEstado] = useState<{ modelo: ModeloGrade | null; meta: MetaModelo | null; erro: boolean }>({ modelo: null, meta: null, erro: false });
  useEffect(() => {
    if (!modelo) return;
    let cancelado = false;
    fetchMeta(modelo)
      .then((meta) => !cancelado && setEstado({ modelo, meta, erro: false }))
      .catch(() => !cancelado && setEstado({ modelo, meta: null, erro: true }));
    return () => {
      cancelado = true;
    };
  }, [modelo]);
  const atual = estado.modelo === modelo;
  return { meta: atual ? estado.meta : null, erro: atual && estado.erro, carregando: !!modelo && !atual };
}

/** Carrega as grades que o produto usa e calcula o campo da hora escolhida. */
export function useResultadoProduto(modelo: ModeloGrade | null, meta: MetaModelo | null, produto: Produto | null, hora: number | null) {
  const chave = modelo && meta && produto ? `${modelo}|${meta.run}|${produto.id}` : null;
  const [carregado, setCarregado] = useState<{ chave: string; grades: Record<string, Grade> | null } | null>(null);

  useEffect(() => {
    if (!chave || !modelo || !meta || !produto) return;
    let cancelado = false;
    Promise.all(produto.vars.map((v) => fetchGrade(modelo, v, meta.run).then((g) => [v, g] as const)))
      .then((pares) => !cancelado && setCarregado({ chave, grades: Object.fromEntries(pares) }))
      .catch(() => !cancelado && setCarregado({ chave, grades: null }));
    return () => {
      cancelado = true;
    };
  }, [chave, modelo, meta, produto]);

  const pronto = carregado && carregado.chave === chave ? carregado : null;
  const resultado: ResultadoProduto | null = useMemo(() => {
    if (!pronto?.grades || !produto || hora === null) return null;
    return produto.calcula(pronto.grades, hora);
  }, [pronto, produto, hora]);
  const geo: Geo | null = pronto?.grades ? Object.values(pronto.grades)[0] ?? null : null;
  return { resultado, geo, carregando: !!chave && !pronto, erro: !!pronto && !pronto.grades };
}

/** Estado de uma visualização de modelo (modelo, produto, validade, transparência, animação) — usado no mapa e nos quadros. */
export function useEstadoModelo(modeloInicial: ModeloGrade, ativo = true, alvoExterno: number | null = null) {
  const [modelo, setModelo] = useState<ModeloGrade>(modeloInicial);
  const { meta, erro: erroMeta, carregando: carregandoMeta } = useMetaModelo(ativo ? modelo : null);
  const produtos = useMemo(() => (meta ? produtosDoModelo(meta) : []), [meta]);
  const [produtoId, setProdutoId] = useState("");
  const produto = produtos.find((p) => p.id === produtoId) ?? produtos.find((p) => p.id === produtoPadraoGrade(produtos)) ?? null;
  const runMs = meta ? runParaMs(meta.run) : 0;
  const [alvoLocal, setAlvoLocal] = useState<number | null>(null);
  const [agora] = useState(() => Date.now());
  const alvo = alvoExterno ?? alvoLocal ?? agora;
  const hora = produto ? horaMaisProxima(produto.horas, runMs, alvo) : null;
  const [opacidade, setOpacidade] = useState(0.78);
  const [tocando, setTocando] = useState(false);
  const { resultado, geo, carregando: carregandoGrade, erro: erroGrade } = useResultadoProduto(ativo ? modelo : null, meta, produto, hora);
  const irParaHora = (h: number) => setAlvoLocal(runMs + h * 3600000);

  // contornos (isóbaras, altura geopotencial...) de uma variável do mesmo modelo
  const [contornoId, setContornoId] = useState("");
  const opcoesContorno = useMemo(() => CONTORNOS_DEF.filter((c) => meta?.variaveis.some((v) => v.id === c.id)), [meta]);
  const defContorno = opcoesContorno.find((c) => c.id === contornoId) ?? null;
  const chaveCont = ativo && meta && defContorno ? `${modelo}|${meta.run}|${defContorno.id}` : null;
  const [gradeCont, setGradeCont] = useState<{ chave: string; grade: Grade | null } | null>(null);
  useEffect(() => {
    if (!chaveCont || !meta || !defContorno) return;
    let cancelado = false;
    fetchGrade(modelo, defContorno.id, meta.run)
      .then((grade) => !cancelado && setGradeCont({ chave: chaveCont, grade }))
      .catch(() => !cancelado && setGradeCont({ chave: chaveCont, grade: null }));
    return () => {
      cancelado = true;
    };
  }, [chaveCont, modelo, meta, defContorno]);
  const contorno: { niveis: NivelContorno[]; rotulo: string; un: string; intervalo: number } | null = useMemo(() => {
    const g = gradeCont && gradeCont.chave === chaveCont ? gradeCont.grade : null;
    if (!g || !defContorno || hora === null) return null;
    const h = g.passos.reduce((m, p) => (Math.abs(p - hora) < Math.abs(m - hora) ? p : m), g.passos[0]);
    return { niveis: calcularContornos(g.dados[g.passos.indexOf(h)], g, defContorno.intervalo), rotulo: defContorno.rotulo, un: defContorno.un, intervalo: defContorno.intervalo };
  }, [gradeCont, chaveCont, defContorno, hora]);

  return {
    contornoId, setContornoId, opcoesContorno, contorno,
    modelo, setModelo, meta, produtos, produto, produtoId: produto?.id ?? "", setProdutoId, runMs, hora, irParaHora, opacidade, setOpacidade,
    tocando, setTocando, resultado, geo, carregando: carregandoMeta || carregandoGrade, erro: erroMeta || erroGrade,
  };
}
