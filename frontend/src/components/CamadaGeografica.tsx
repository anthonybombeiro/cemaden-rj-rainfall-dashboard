"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/** Imagem em projeção GEOGRÁFICA (graus lineares em latitude e longitude, como os JPG do DSAT/CPTEC)
 * desenhada corretamente sobre o mapa em Web Mercator.
 *
 * O `ImageOverlay` do Leaflet estica a imagem linearmente entre os cantos NO ESPAÇO MERCATOR; para uma
 * imagem que cobre 68° de latitude isso desloca tudo (a costa não bate com o mapa — relato de 09/10/2026).
 * Aqui a imagem vira uma camada de tiles em canvas: cada linha de pixels da imagem é posicionada na
 * latitude Mercator correta (`map.project`), e a longitude (linear nas duas projeções) é recortada por tile.
 * `drawImage` com imagem de outra origem funciona (só não dá para ler os pixels), então não precisa de CORS. */

type Limites = [[number, number], [number, number]]; // [[sul, oeste], [norte, leste]]

const cacheImagens = new Map<string, HTMLImageElement>();

function carregar(url: string): Promise<HTMLImageElement> {
  const c = cacheImagens.get(url);
  if (c) return Promise.resolve(c);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (cacheImagens.size > 8) cacheImagens.delete(cacheImagens.keys().next().value as string);
      cacheImagens.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function CamadaGeografica({
  url,
  bounds,
  opacity = 0.8,
  zIndex = 400,
}: {
  url: string;
  bounds: Limites;
  opacity?: number;
  zIndex?: number;
}) {
  const map = useMap();
  const estado = useRef<{ img: HTMLImageElement | null; bounds: Limites; tiles: Map<HTMLCanvasElement, L.Coords> }>({
    img: null,
    bounds,
    tiles: new Map(),
  });
  const camadaRef = useRef<L.GridLayer | null>(null);

  // cria a camada uma vez por mapa
  useEffect(() => {
    const e = estado.current;

    const desenhar = (canvas: HTMLCanvasElement, coords: L.Coords) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = e.img;
      if (!img) return;
      const [[sul, oeste], [norte, leste]] = e.bounds;
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const grauX = (leste - oeste) / W; // graus por pixel (longitude)
      const grauY = (norte - sul) / H; // graus por pixel (latitude)
      const z = coords.z;
      const tam = 256;
      const x0 = coords.x * tam;
      const y0 = coords.y * tam;
      const lonEsq = map.unproject(L.point(x0, y0), z).lng;
      const lonDir = map.unproject(L.point(x0 + tam, y0), z).lng;
      const latTopo = map.unproject(L.point(x0, y0), z).lat;
      const latBase = map.unproject(L.point(x0, y0 + tam), z).lat;

      // colunas de origem visíveis neste tile
      const sx0 = Math.max(0, (lonEsq - oeste) / grauX);
      const sx1 = Math.min(W, (lonDir - oeste) / grauX);
      if (sx1 <= sx0) return;
      const dx0 = ((oeste + sx0 * grauX - lonEsq) / (lonDir - lonEsq)) * tam;
      const dx1 = ((oeste + sx1 * grauX - lonEsq) / (lonDir - lonEsq)) * tam;

      // linhas de origem visíveis neste tile (linha 0 = norte)
      const j0 = Math.max(0, Math.floor((norte - latTopo) / grauY));
      const j1 = Math.min(H - 1, Math.ceil((norte - latBase) / grauY));
      if (j1 < j0) return;
      ctx.imageSmoothingEnabled = true;
      let yAnt = map.project(L.latLng(norte - j0 * grauY, 0), z).y - y0;
      for (let j = j0; j <= j1; j++) {
        const yProx = map.project(L.latLng(norte - (j + 1) * grauY, 0), z).y - y0;
        const dy = Math.floor(yAnt);
        const dh = Math.max(1, Math.ceil(yProx) - dy);
        if (dy + dh > 0 && dy < tam) {
          ctx.drawImage(img, sx0, j, sx1 - sx0, 1, dx0, dy, dx1 - dx0, dh);
        }
        yAnt = yProx;
      }
    };

    const Camada = L.GridLayer.extend({
      createTile(coords: L.Coords) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        e.tiles.set(canvas, coords);
        desenhar(canvas, coords);
        return canvas;
      },
    });
    const camada = new (Camada as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({
      tileSize: 256,
      opacity,
      zIndex,
      updateWhenZooming: false,
    });
    camada.on("tileunload", (ev: L.TileEvent) => {
      e.tiles.delete(ev.tile as unknown as HTMLCanvasElement);
    });
    camada.addTo(map);
    camadaRef.current = camada;
    (camada as unknown as { _redesenhar: () => void })._redesenhar = () => {
      e.tiles.forEach((coords, canvas) => desenhar(canvas, coords));
    };
    return () => {
      camada.remove();
      camadaRef.current = null;
      e.tiles.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // troca de quadro/imagem: carrega e redesenha os tiles existentes (sem recriar → sem piscar)
  useEffect(() => {
    let cancelado = false;
    carregar(url)
      .then((img) => {
        if (cancelado) return;
        estado.current.img = img;
        estado.current.bounds = bounds;
        (camadaRef.current as unknown as { _redesenhar?: () => void } | null)?._redesenhar?.();
      })
      .catch(() => {
        /* imagem indisponível: mantém a anterior */
      });
    return () => {
      cancelado = true;
    };
  }, [url, bounds]);

  useEffect(() => {
    camadaRef.current?.setOpacity(opacity);
  }, [opacity]);

  return null;
}
