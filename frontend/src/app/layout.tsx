import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Painel Integrado de Monitoramento - CEMADEN-RJ / SEDEC",
  description: "Agregador de dados meteorológicos e hidrológicos do estado do Rio de Janeiro",
  // Ícone oficial da CEMADEN-RJ (pedido do usuário, 2026-09-23) — usado na
  // aba do navegador e como ícone do app instalado (PWA — ver
  // ServiceWorkerRegister.tsx/public/sw.js, adicionado em 2026-09-24).
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icon-180.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1f3864",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-gray-900">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
