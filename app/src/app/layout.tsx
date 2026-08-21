import type { Metadata } from "next";
import { Afacad } from "next/font/google";
import "./globals.css";

const afacad = Afacad({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // choose the weights you need
  variable: "--font-afacad",
});

export const metadata: Metadata = {
  title: "groupwork",
  description: "powering ai native teams.",
  icons: {
    icon: "/high-resolution-color-logo.svg", // points to public/logo.svg
  },
};


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={afacad.variable}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
