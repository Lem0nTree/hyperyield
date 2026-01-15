import "@/styles/globals.css";
import "@/styles/App.scss";
import { createWeb3Modal, defaultWagmiConfig } from "@web3modal/wagmi/react";

import { WagmiConfig } from "wagmi";
import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import {

	mantle,
} from "wagmi/chains";
import { defineChain } from "viem";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";

// Custom chain: Mantle Sepolia Testnet
const mantleSepoliaTestnet = defineChain({
	id: 5003,
	name: "Mantle Sepolia Testnet",
	network: "mantle-sepolia-testnet",
	nativeCurrency: {
		name: "Mantle",
		symbol: "MNT",
		decimals: 18,
	},
	rpcUrls: {
		default: {
			http: ["https://rpc.sepolia.mantle.xyz"],
		},
		public: {
			http: ["https://rpc.sepolia.mantle.xyz"],
		},
	},
	blockExplorers: {
		default: {
			name: "Mantle Sepolia Explorer",
			url: "https://explorer.sepolia.mantle.xyz",
		},
	},
	testnet: true,
});

const chains = [

	mantle,
	mantleSepoliaTestnet,
];

// 1. Get projectID at https://cloud.walletconnect.com

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "";

const metadata = {
	name: "Next Starter Template",
	description: "A Next.js starter template with Web3Modal v3 + Wagmi",
	url: "https://web3modal.com",
	icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

createWeb3Modal({ wagmiConfig, projectId, chains });

// MUI Theme configuration
const theme = createTheme({
	palette: {
		mode: "dark",
	},
});

export default function App({ Component, pageProps }: AppProps) {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);
	}, []);
	return (
		<>
			{ready ? (
				<ThemeProvider theme={theme}>
					<CssBaseline />
					<WagmiConfig config={wagmiConfig}>
						<Component {...pageProps} />
					</WagmiConfig>
				</ThemeProvider>
			) : null}
		</>
	);
}
