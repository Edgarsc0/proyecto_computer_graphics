import { Noto_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "MAPPA - Sistema de Mapeo Cartográfico Local e Interactivo",
  description: "Aplicación interactiva de proyección conforme y conforme local de coordenadas geográficas WGS84 sobre lienzo SVG isótropo del campus escolar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={geistMono.variable}>
      <body className={notoSans.className}>{children}</body>
    </html>
  );
}
