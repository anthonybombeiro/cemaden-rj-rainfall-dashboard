"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import { amostrar, criarCor, Escala, Geo, ResultadoProduto } from "@/lib/modelosGrade";
import { NivelContorno } from "@/lib/modelosExtras";

export type ContornoDesenho = { niveis: NivelContorno[]; intervalo: number } | null;

const PANE = "modeloGradePane";
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latDeMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** Camada de grade interativa: desenha o campo do modelo (bilinear, a cada pixel da tela) e setas de vento sobre o mapa Leaflet.
 * Redesenha ao mover/ampliar, então fica nítida em qualquer zoom. Fica ABAIXO das linhas de REDEC/município e das estações. */
export default function CamadaGradeCanvas({
  geo,
  resultado,
  escala,
  opacidade,
  contorno = null,
  onHover,
  onClick,
}: {
  contorno?: ContornoDesenho;
  geo: Geo | null;
  resultado: ResultadoProduto | null;
  escala: Escala;
  opacidade: number;
  onHover?: (p: { lat: number; lon: number; valor: number } | null) => void;
  onClick?: (p: { lat: number; lon: number }) => void;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dados = useRef<{ geo: Geo | null; resultado: ResultadoProduto | null; escala: Escala; contorno: ContornoDesenho }>({ geo, resultado, escala, contorno });
  const cb = useRef({ onHover, onClick });

  useEffect(() => {
    cb.current = { onHover, onClick };
  }, [onHover, onClick]);

  const desenhar = useRef<() => void>(() => {});

  useEffect(() => {
    let pane = map.getPane(PANE);
    if (!pane) {
      pane = map.createPane(PANE);
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    const canvas = document.createElement("canvas");
    canvas.className = "leaflet-zoom-animated";
    canvas.style.pointerEvents = "none";
    pane.appendChild(canvas);
    canvasRef.current = canvas;
    const off = document.createElement("canvas");

    const redesenhar = () => {
      const { geo: g, resultado: r, escala: e, contorno: ct } = dados.current;
      const size = map.getSize();
      const tl = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, tl);
      L.DomUtil.setTransform(canvas, tl, 1);
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!g || !r) {
        if (ct) desenharContornos(ctx, ct);
        return;
      }
      const S = 3; // 1 amostra a cada 3 px, ampliada com suavização
      const w = Math.ceil(size.x / S), h = Math.ceil(size.y / S);
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) return;
      const img = octx.createImageData(w, h);
      const a = map.containerPointToLatLng([0, 0]);
      const b = map.containerPointToLatLng([size.x, size.y]);
      const yTop = mercY(a.lat), yBot = mercY(b.lat);
      const fxs = new Float32Array(w), fys = new Float32Array(h);
      for (let c = 0; c < w; c++) fxs[c] = (a.lng + ((b.lng - a.lng) * (c * S + S / 2)) / size.x - g.lon0) / g.dlon;
      for (let l = 0; l < h; l++) fys[l] = (g.lat0 - latDeMercY(yTop + ((yBot - yTop) * (l * S + S / 2)) / size.y)) / g.dlat;
      const cor = criarCor(e);
      const v = r.valores;
      const d = img.data;
      for (let l = 0; l < h; l++) {
        const fy = fys[l];
        if (fy < 0 || fy > g.ny - 1) continue;
        const y0 = Math.min(Math.floor(fy), g.ny - 2), ty = fy - y0;
        for (let c = 0; c < w; c++) {
          const fx = fxs[c];
          if (fx < 0 || fx > g.nx - 1) continue;
          const x0 = Math.min(Math.floor(fx), g.nx - 2), tx = fx - x0;
          const i = y0 * g.nx + x0;
          const val = v[i] * (1 - tx) * (1 - ty) + v[i + 1] * tx * (1 - ty) + v[i + g.nx] * (1 - tx) * ty + v[i + g.nx + 1] * tx * ty;
          const rgba = cor(val);
          const o = (l * w + c) * 4;
          d[o] = rgba[0];
          d[o + 1] = rgba[1];
          d[o + 2] = rgba[2];
          d[o + 3] = rgba[3];
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(off, 0, 0, w * S, h * S);

      if (ct) desenharContornos(ctx, ct);
      if (r.setas) {
        const esp = 34;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(15,15,15,0.8)";
        ctx.fillStyle = "rgba(15,15,15,0.8)";
        for (let py = esp / 2; py < size.y; py += esp) {
          const lat = latDeMercY(yTop + ((yBot - yTop) * py) / size.y);
          for (let px = esp / 2; px < size.x; px += esp) {
            const lon = a.lng + ((b.lng - a.lng) * px) / size.x;
            const u = amostrar(r.setas.u, g, lat, lon), vv = amostrar(r.setas.v, g, lat, lon);
            if (!(u === u) || !(vv === vv)) continue;
            const vel = Math.hypot(u, vv);
            if (vel < 0.3) continue;
            const ang = Math.atan2(-vv, u);
            const len = 9 + Math.min(vel, 25) * 0.5;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(-len / 2, 0);
            ctx.lineTo(len / 2, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(len / 2, 0);
            ctx.lineTo(len / 2 - 5, -3);
            ctx.lineTo(len / 2 - 5, 3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }
    };
    const desenharContornos = (ctx: CanvasRenderingContext2D, ct: NonNullable<ContornoDesenho>) => {
      const usados = new Set<string>();
      ctx.lineJoin = "round";
      ctx.font = "600 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const rotulos: [number, number, string][] = [];
      for (const n of ct.niveis) {
        const principal = Math.round(n.nivel / ct.intervalo) % 5 === 0;
        ctx.beginPath();
        ctx.strokeStyle = principal ? "rgba(20,20,20,0.85)" : "rgba(40,40,40,0.55)";
        ctx.lineWidth = principal ? 1.6 : 0.9;
        for (const [lo1, la1, lo2, la2] of n.segs) {
          const a = map.latLngToContainerPoint([la1, lo1]);
          const b = map.latLngToContainerPoint([la2, lo2]);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          const chave = `${n.nivel}|${Math.floor(a.x / 260)}|${Math.floor(a.y / 260)}`;
          if (!usados.has(chave) && a.x > 20 && a.y > 12 && a.x < canvas.width - 20 && a.y < canvas.height - 12) {
            usados.add(chave);
            rotulos.push([a.x, a.y, String(Math.round(n.nivel * 10) / 10)]);
          }
        }
        ctx.stroke();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle = "#111";
      for (const [x, y, t] of rotulos) {
        ctx.strokeText(t, x, y);
        ctx.fillText(t, x, y);
      }
    };
    desenhar.current = redesenhar;

    const aoZoomAnim = (ev: L.ZoomAnimEvent) => {
      const escalaZ = map.getZoomScale(ev.zoom, map.getZoom());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offset = (map as any)._latLngToNewLayerPoint(map.getBounds().getNorthWest(), ev.zoom, ev.center);
      L.DomUtil.setTransform(canvas, offset, escalaZ);
    };
    let raf = 0;
    const aoMover = (ev: L.LeafletMouseEvent) => {
      if (!cb.current.onHover) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { geo: g, resultado: r } = dados.current;
        if (!g || !r) return cb.current.onHover?.(null);
        const valor = amostrar(r.valores, g, ev.latlng.lat, ev.latlng.lng);
        cb.current.onHover?.(valor === valor ? { lat: ev.latlng.lat, lon: ev.latlng.lng, valor } : null);
      });
    };
    const aoClicar = (ev: L.LeafletMouseEvent) => {
      // clique numa estação/linha interativa não abre o meteograma
      const alvo = ev.originalEvent?.target as HTMLElement | undefined;
      if (alvo?.closest?.(".leaflet-interactive, .leaflet-popup")) return;
      cb.current.onClick?.({ lat: ev.latlng.lat, lon: ev.latlng.lng });
    };
    const aoSair = () => cb.current.onHover?.(null);

    map.on("moveend zoomend resize", redesenhar);
    map.on("zoomanim", aoZoomAnim);
    map.on("mousemove", aoMover);
    map.on("click", aoClicar);
    map.on("mouseout", aoSair);
    redesenhar();
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend zoomend resize", redesenhar);
      map.off("zoomanim", aoZoomAnim);
      map.off("mousemove", aoMover);
      map.off("click", aoClicar);
      map.off("mouseout", aoSair);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    dados.current = { geo, resultado, escala, contorno };
    if (canvasRef.current) canvasRef.current.style.opacity = String(opacidade);
    desenhar.current();
  }, [geo, resultado, escala, opacidade, contorno]);

  return null;
}
