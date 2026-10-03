/**
 * Service worker do Painel CEMADEN-RJ (pedido do usuário, 2026-09-24:
 * "deixar o site instalável como um app pro celular"). Arquivo estático
 * puro — sem build tool nenhuma (Workbox etc.) de propósito: o
 * HostGator só serve arquivos estáticos, então isso precisa funcionar
 * sozinho, sem nenhum passo de servidor.
 *
 * Regra de segurança mais importante daqui: NUNCA cachear `/api/*`.
 * Isso é um painel de monitoramento de defesa civil — mostrar chuva/nível
 * de rio/sirene de uma resposta VELHA guardada em cache, como se fosse
 * dado atual, é pior do que mostrar "sem conexão" de verdade. Só o
 * "esqueleto" do app (HTML/JS/CSS/ícones) é cacheado, nunca dado.
 */

const CACHE_VERSION = "cemadenrj-v2";
const APP_SHELL = ["/", "/manifest.json", "/favicon.ico", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}), // um ícone faltando não pode impedir a instalação
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar requisição de outra origem (pedido do usuário,
  // 02/10/2026: integrações com APIs públicas de terceiros — radar de
  // Niterói, Alerta Rio, INEA — chamadas DIRETO do navegador). Bug real
  // encontrado: sem esse corte, a regra "network-first com fallback pro
  // cache" lá embaixo também capturava essas chamadas; se o
  // `cache.put()` de uma resposta cross-origin falhasse (comum —
  // respostas "opacas"/sem CORS liberado não podem ser cacheadas), o
  // `.catch()` caía no fallback `caches.match("/")` e devolvia o HTML do
  // NOSSO painel no lugar da resposta da API externa — o fetch() da
  // página recebia "sucesso" (200) com HTML em vez do JSON esperado, o
  // `.json()` falhava silenciosamente e nenhuma imagem aparecia, sem
  // nenhum erro visível de rede. Cross-origin passa direto pro navegador,
  // sem passar pelo Service Worker.
  if (url.origin !== self.location.origin) return;

  // Só GET faz sentido cachear; POST (login, refresh, etc.) sempre direto
  // pra rede.
  if (event.request.method !== "GET") return;

  // Nunca cachear a API — ver comentário no topo do arquivo.
  if (url.pathname.startsWith("/api/")) return;

  // Assets versionados por hash (_next/static/...) são IMUTÁVEIS (um
  // build novo gera um hash novo) — cache-first é seguro e rápido.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((resp) => {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
            return resp;
          }),
      ),
    );
    return;
  }

  // Resto do shell (HTML/manifest/ícones/geojson) — network-first: quem
  // está online sempre vê a versão mais nova; só cai pro cache guardado
  // se a rede falhar (abrir o app offline depois de já ter visitado 1x).
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return resp;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
  );
});
