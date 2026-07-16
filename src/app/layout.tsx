import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import "@/lib/env";
import "./globals.css";

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
	weight: ["300", "400", "500", "600", "700"],
	display: "swap",
});

const dmMono = DM_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	weight: ["300", "400", "500"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "IM Operations",
	description: "Operational platform for moving and logistics coordination",
	manifest: "/manifest.json",
	icons: {
		icon: "/favicon.png",
		apple: "/apple-touch-icon.png",
	},
	appleWebApp: {
		capable: true,
		title: "IM Operations",
		statusBarStyle: "default",
	},
};

export const viewport = {
	themeColor: "#0ea5e9",
	width: "device-width",
	initialScale: 1,
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await getLocale();
	const messages = await getMessages();
	// Read the per-request nonce forwarded by middleware so it can be applied to
	// the theme-init inline script. Next.js 14 also reads this header internally
	// and adds it to all its own generated inline scripts.
	const nonce = (await headers()).get("x-nonce") ?? undefined;

	return (
		<html lang={locale} suppressHydrationWarning>
			<head>
				{/* Anti-flash: apply saved theme before first paint */}
				<script
					nonce={nonce}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: intentional inline script for theme initialization
					dangerouslySetInnerHTML={{
						__html:
							"(function(){var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark');})();",
					}}
				/>
			</head>
			<body className={`${dmSans.variable} ${dmMono.variable} antialiased`}>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<NavigationProgress />
					{children}
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
