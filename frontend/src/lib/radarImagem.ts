// Quadros de radar para as imagens do informativo: busca (via backend), recorta o estado do RJ com as divisas municipais e das REDECs e devolve um PNG.
import { getJson } from "@/lib/api";
import { urlImagemRadar } from "@/lib/informativo";
import { caminho, carregarGeoRj, GeoRj, mercatorY, projecao } from "@/lib/mapaCanvas";

/** Radares do Mapa que o técnico pode escolher. `nome` é o que vai na legenda: "Radar {nome} - atualização de HHhMM (hora local)". */
export type FonteRadar = { id: string; nome: string; rotulo: string; rota: string };
export const FONTES_RADAR: FonteRadar[] = [
  { id: "redemet-pc", nome: "Pico do Couto", rotulo: "Pico do Couto (REDEMET/DECEA)", rota: "/imagery/radar/?tipo=maxcappi&area=pc" },
  { id: "redemet-st", nome: "Santa Teresa", rotulo: "Santa Teresa (REDEMET/DECEA)", rota: "/imagery/radar/?tipo=maxcappi&area=st" },
  { id: "inea-mosaic", nome: "Mosaico INEA", rotulo: "Mosaico dos radares do RJ (INEA)", rota: "/imagery/radar-inea/?tipo=mosaic&produto=zh" },
  { id: "inea-gua", nome: "Guaratiba", rotulo: "Guaratiba (INEA)", rota: "/imagery/radar-inea/?tipo=gua&produto=zh" },
  { id: "inea-mac", nome: "Macaé", rotulo: "Macaé (INEA)", rota: "/imagery/radar-inea/?tipo=mac&produto=zh" },
  { id: "inea-mdn", nome: "Mendanha", rotulo: "Mendanha (INEA)", rota: "/imagery/radar-inea/?tipo=mdn&produto=zh" },
  { id: "inea-sumare", nome: "Sumaré", rotulo: "Sumaré (INEA)", rota: "/imagery/radar-inea/?tipo=sumare&produto=zh" },
];
type Resp = { timestamp: string; image_url: string; bounds: [[number, number], [number, number]] };
export type QuadroRadar = { png: string; quando: Date; fonte: FonteRadar };

export const legendaRadar = (q: QuadroRadar, hora: string) => `Radar ${q.fonte.nome} - atualização de ${hora} (hora local)`;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const i = new Image();
    i.crossOrigin = "use-credentials";
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error("Não foi possível baixar o quadro de radar."));
    i.src = url;
  });
}

/** Recorte do estado no quadro (fundo transparente, sem mar), com a menor margem possível para o mapa ocupar o máximo do espaço. */
function desenhar(geo: GeoRj, img: HTMLImageElement, bounds: Resp["bounds"]): string {
  const L = 1400;
  const p = projecao(geo.bbox, L, 3);
  const c = document.createElement("canvas");
  c.width = L; c.height = p.altura;
  const g = c.getContext("2d")!;
  const [[latMin, lonMin], [latMax, lonMax]] = bounds;
  const sx = (lon: number) => ((lon - lonMin) / (lonMax - lonMin)) * img.naturalWidth;
  const sy = (lat: number) => ((mercatorY(latMax) - mercatorY(lat)) / (mercatorY(latMax) - mercatorY(latMin))) * img.naturalHeight;
  const a = p.xy(geo.bbox.minLon, geo.bbox.maxLat), b = p.xy(geo.bbox.maxLon, geo.bbox.minLat);
  g.fillStyle = "#e5eaf0";
  geo.municipios.features.forEach((f) => g.fill(caminho(f, p)));
  g.drawImage(img, sx(geo.bbox.minLon), sy(geo.bbox.maxLat), sx(geo.bbox.maxLon) - sx(geo.bbox.minLon), sy(geo.bbox.minLat) - sy(geo.bbox.maxLat), a[0], a[1], b[0] - a[0], b[1] - a[1]);
  g.strokeStyle = "rgba(30,41,59,0.55)"; g.lineWidth = 1;
  geo.municipios.features.forEach((f) => g.stroke(caminho(f, p)));
  g.strokeStyle = "#1f3864"; g.lineWidth = 2.8;
  geo.redecs.features.forEach((f) => g.stroke(caminho(f, p)));
  return c.toDataURL("image/png");
}

export async function gerarQuadroRadar(fonte: FonteRadar): Promise<QuadroRadar> {
  const [geo, d] = await Promise.all([carregarGeoRj(), getJson<Resp>(fonte.rota)]);
  const img = await carregarImagem(urlImagemRadar(d.image_url));
  return { png: desenhar(geo, img, d.bounds), quando: new Date(`${d.timestamp.replace(" ", "T")}Z`), fonte }; // o backend devolve UTC
}
