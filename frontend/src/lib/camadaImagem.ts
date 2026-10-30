// Imagens de radar e de satélite recortadas no estado do RJ (informativo e botão "Gerar imagem" do Mapa): mesmo catálogo de fontes e produtos do Mapa, busca do
// quadro mais recente, recorte com as divisas municipais e das REDECs e legenda no padrão dos grupos.
import { getJson } from "@/lib/api";
import { urlImagemRadar } from "@/lib/informativo";
import { caminho, carregarGeoRj, GeoRj, horaLocal, mercatorY, projecao } from "@/lib/mapaCanvas";

type Bounds = [[number, number], [number, number]];
export type RadarId = "pc" | "st" | "mosaico-sudeste" | "inea-mosaic" | "inea-gua" | "inea-mac" | "inea-mdn" | "inea-sumare" | "niteroi";
export type TipoSatelite = "truecolor" | "dsat_realcada" | "dsat_ch13" | "dsat_ch02" | "realcada" | "ir" | "vis";
export type Selecao = { tipo: "radar" | "satelite"; radar: RadarId; produto: string; satelite: TipoSatelite };
export const SELECAO_PADRAO: Selecao = { tipo: "radar", radar: "pc", produto: "maxcappi", satelite: "truecolor" };

type Produto = { id: string; rotulo: string };
const REDEMET: Produto[] = [
  { id: "maxcappi", rotulo: "MAXCAPPI (máximo da coluna)" },
  { id: "03km", rotulo: "CAPPI 3 km" },
  { id: "05km", rotulo: "CAPPI 5 km" },
  { id: "07km", rotulo: "CAPPI 7 km" },
  { id: "10km", rotulo: "CAPPI 10 km" },
];
const ZH: Produto = { id: "zh", rotulo: "Refletividade (dBZ)" };
const RR: Produto = { id: "rr", rotulo: "Precipitação (mm/h)" };
const VEL: Produto = { id: "vel", rotulo: "Velocidade radial (m/s)" };
/** Os mesmos radares do Mapa. `nome` entra na legenda: "Radar {nome} - atualização de HHhMM (hora local)". */
export const RADARES: { id: RadarId; nome: string; rotulo: string; produtos: Produto[] }[] = [
  { id: "pc", nome: "Pico do Couto", rotulo: "REDEMET — Pico do Couto/RJ", produtos: REDEMET },
  { id: "st", nome: "Santa Teresa", rotulo: "REDEMET — Santa Teresa", produtos: REDEMET },
  { id: "mosaico-sudeste", nome: "Mosaico Sudeste", rotulo: "REDEMET — Mosaico Sudeste (RJ, SP, MG, ES)", produtos: REDEMET },
  { id: "inea-mosaic", nome: "Mosaico INEA", rotulo: "INEA — Mosaico dos radares do RJ", produtos: [ZH, RR] },
  { id: "inea-gua", nome: "Guaratiba", rotulo: "INEA — Guaratiba", produtos: [ZH, RR, VEL] },
  { id: "inea-mac", nome: "Macaé", rotulo: "INEA — Macaé", produtos: [ZH, RR, VEL] },
  { id: "inea-mdn", nome: "Mendanha", rotulo: "INEA — Mendanha", produtos: [ZH, RR, VEL] },
  { id: "inea-sumare", nome: "Sumaré", rotulo: "INEA — Sumaré", produtos: [ZH] },
  { id: "niteroi", nome: "Niterói", rotulo: "Niterói", produtos: [{ id: "maxdisplay", rotulo: "MAXDISPLAY (Prefeitura de Niterói)" }, { id: "zh", rotulo: "Refletividade (dBZ) — via INEA" }, { id: "rr", rotulo: "Precipitação (mm/h) — via INEA" }, { id: "vel", rotulo: "Velocidade radial (m/s) — via INEA" }] },
];
export const SATELITES: { id: TipoSatelite; nome: string; rotulo: string }[] = [
  { id: "truecolor", nome: "GOES-19 cor verdadeira", rotulo: "Cor verdadeira — True Color (DSAT/INPE)" },
  { id: "dsat_realcada", nome: "GOES-19 IR realçado", rotulo: "IR realçado (DSAT/INPE)" },
  { id: "dsat_ch13", nome: "GOES-19 IR canal 13", rotulo: "IR canal 13 (DSAT/INPE)" },
  { id: "dsat_ch02", nome: "GOES-19 visível canal 02", rotulo: "Visível canal 02 (DSAT/INPE)" },
  { id: "realcada", nome: "REDEMET realçada", rotulo: "Realçada (REDEMET)" },
  { id: "ir", nome: "REDEMET infravermelho", rotulo: "Infravermelho (REDEMET)" },
  { id: "vis", nome: "REDEMET visível", rotulo: "Visível (REDEMET)" },
];
const eDsat = (t: TipoSatelite) => t === "truecolor" || t.startsWith("dsat_");

export type Quadro = { camadas: { url: string; bounds: Bounds }[]; quando: Date; linear: boolean; direto: boolean };

const NITEROI = { base: "https://radar.niteroi.rj.gov.br:3337", radar: "b35bf5fe-a016-4516-81bb-681088e72ce7", tipo: "a57c0a09-e9f0-461c-84b9-65ea856cc90c", bounds: [[-23.828487624961028, -44.063540906953534], [-22.029734127406552, -42.11079267870416]] as Bounds };
const utc = (s: string) => new Date(`${s.replace(" ", "T")}Z`); // as APIs devolvem "AAAA-MM-DD HH:MM:SS" em UTC

/** Busca o quadro mais recente da seleção (as mesmas rotas que o Mapa usa). */
export async function buscarQuadro(sel: Selecao): Promise<Quadro> {
  type Resp = { timestamp: string; image_url: string; bounds: Bounds };
  const simples = (d: Resp, linear = false): Quadro => {
    if (!d || !d.image_url || !d.bounds) throw new Error("Sem imagem disponível para esta fonte agora.");
    return { camadas: [{ url: d.image_url, bounds: d.bounds }], quando: utc(d.timestamp), linear, direto: false };
  };
  if (sel.tipo === "satelite") {
    // o GOES-19 do CPTEC vem em latitude/longitude regulares (0,02°/pixel); a REDEMET segue o mesmo esticamento que o Mapa usa
    return eDsat(sel.satelite) ? simples(await getJson<Resp>(`/imagery/dsat/?tipo=${sel.satelite}`), true) : simples(await getJson<Resp>(`/imagery/satelite/?tipo=${sel.satelite}`));
  }
  if (sel.radar === "mosaico-sudeste") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await getJson(`/imagery/radar-mosaico/?tipo=${sel.produto}&anima=2`);
    const q = j?.quadros?.[j.quadros.length - 1];
    if (!q) throw new Error("Sem quadro do mosaico agora.");
    const radares: { codigo: string; bounds: Bounds | null }[] = j.radares ?? [];
    const por = Object.fromEntries(radares.map((r) => [r.codigo, r.bounds]));
    const dist = (b: Bounds | null | undefined) => (b ? Math.hypot((b[0][0] + b[1][0]) / 2 + 22.3, (b[0][1] + b[1][1]) / 2 + 42.6) : 0);
    // os mais afastados do RJ primeiro: o radar do RJ fica por cima onde há sobreposição
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgs: any[] = q.imagens.filter((i: any) => por[i.radar]).sort((a: any, b: any) => dist(por[b.radar]) - dist(por[a.radar]));
    return { camadas: imgs.map((i) => ({ url: i.path, bounds: por[i.radar] as Bounds })), quando: utc(q.data), linear: false, direto: false };
  }
  if (sel.radar === "niteroi" && sel.produto === "maxdisplay") {
    const prods: { datetime: string; images: { path: string }[] }[] = await fetch(`${NITEROI.base}/radars/${NITEROI.radar}/products?${new URLSearchParams({ type_id: NITEROI.tipo, cutoff_datetime: String(Date.now()), amount: "1" })}`).then((r) => r.json());
    const p = prods.find((x) => x.images?.length);
    if (!p) throw new Error("Sem quadro do radar de Niterói agora.");
    return { camadas: [{ url: `${NITEROI.base}${p.images[0].path}`, bounds: NITEROI.bounds }], quando: new Date(Number(p.datetime)), linear: false, direto: true };
  }
  if (sel.radar === "niteroi" || sel.radar.startsWith("inea-")) {
    return simples(await getJson<Resp>(`/imagery/radar-inea/?tipo=${sel.radar === "niteroi" ? "nit" : sel.radar.replace("inea-", "")}&produto=${sel.produto}`));
  }
  return simples(await getJson<Resp>(`/imagery/radar/?tipo=${sel.produto}&area=${sel.radar}`));
}

function carregarImagem(url: string, direto: boolean): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const i = new Image();
    i.crossOrigin = direto ? "anonymous" : "use-credentials";
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error("Não foi possível baixar a imagem desta fonte."));
    i.src = direto ? url : urlImagemRadar(url); // as demais fontes não liberam CORS: passam pelo nosso servidor, para o canvas poder exportar
  });
}

/** Recorte do estado do RJ (fundo transparente), com a menor margem possível. Cada camada usa os próprios limites (o mosaico tem várias imagens). */
async function desenhar(geo: GeoRj, q: Quadro): Promise<string> {
  const L = 1400;
  const p = projecao(geo.bbox, L, 3);
  const c = document.createElement("canvas");
  c.width = L; c.height = p.altura;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  const a = p.xy(geo.bbox.minLon, geo.bbox.maxLat), b = p.xy(geo.bbox.maxLon, geo.bbox.minLat);
  g.fillStyle = "#e5eaf0";
  geo.municipios.features.forEach((f) => g.fill(caminho(f, p)));
  for (const cam of q.camadas) {
    const img = await carregarImagem(cam.url, q.direto);
    const [[latMin, lonMin], [latMax, lonMax]] = cam.bounds;
    const sx = (lon: number) => ((lon - lonMin) / (lonMax - lonMin)) * img.naturalWidth;
    const yy = q.linear ? (lat: number) => lat : mercatorY;
    const sy = (lat: number) => ((yy(latMax) - yy(lat)) / (yy(latMax) - yy(latMin))) * img.naturalHeight;
    g.drawImage(img, sx(geo.bbox.minLon), sy(geo.bbox.maxLat), sx(geo.bbox.maxLon) - sx(geo.bbox.minLon), sy(geo.bbox.minLat) - sy(geo.bbox.maxLat), a[0], a[1], b[0] - a[0], b[1] - a[1]);
  }
  g.strokeStyle = "rgba(30,41,59,0.55)"; g.lineWidth = 1;
  geo.municipios.features.forEach((f) => g.stroke(caminho(f, p)));
  g.strokeStyle = "#1f3864"; g.lineWidth = 2.8;
  geo.redecs.features.forEach((f) => g.stroke(caminho(f, p)));
  return c.toDataURL("image/png");
}

export type Gerada = { png: string; quando: Date; legenda: (hora: string) => string; nome: string };

/** Busca o quadro, recorta no estado e devolve a imagem com a função da legenda ("Radar X - atualização de HHhMM (hora local)" / "Satélite X - …"). */
export async function gerarImagem(sel: Selecao): Promise<Gerada> {
  const [geo, quadro] = await Promise.all([carregarGeoRj(), buscarQuadro(sel)]);
  const png = await desenhar(geo, quadro);
  if (sel.tipo === "satelite") {
    const s = SATELITES.find((x) => x.id === sel.satelite) ?? SATELITES[0];
    return { png, quando: quadro.quando, nome: s.nome, legenda: (h) => `Satélite ${s.nome} - atualização de ${h} (hora local)` };
  }
  const r = RADARES.find((x) => x.id === sel.radar) ?? RADARES[0];
  const padrao = r.produtos[0].id;
  const prod = sel.produto !== padrao ? ` (${(r.produtos.find((x) => x.id === sel.produto)?.rotulo ?? sel.produto).split(" (")[0]})` : "";
  return { png, quando: quadro.quando, nome: r.nome, legenda: (h) => `Radar ${r.nome}${prod} - atualização de ${h} (hora local)` };
}

export const hhmm = (d: Date) => horaLocal(d);
