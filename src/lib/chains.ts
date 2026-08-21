export type ChainId = "ethereum" | "base" | "optimism" | "arbitrum" | "polygon" | "gnosis";

export interface ChainConfig {
  id: ChainId;
  name: string;
  short: string;
  host: string;
  nativeSymbol: string;
  nativeDecimals: number;
  color: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (hash: string) => string;
}

function cfg(
  id: ChainId,
  name: string,
  short: string,
  host: string,
  nativeSymbol: string,
  color: string,
): ChainConfig {
  return {
    id,
    name,
    short,
    host,
    nativeSymbol,
    nativeDecimals: 18,
    color,
    explorerTx: (hash) => `${host}/tx/${hash}`,
    explorerAddress: (hash) => `${host}/address/${hash}`,
  };
}

export const CHAINS: ChainConfig[] = [
  cfg("ethereum", "Ethereum", "ETH", "https://eth.blockscout.com", "ETH", "#8f7bff"),
  cfg("base", "Base", "BASE", "https://base.blockscout.com", "ETH", "#59d6e6"),
  cfg("optimism", "Optimism", "OP", "https://optimism.blockscout.com", "ETH", "#ff5c4d"),
  cfg("arbitrum", "Arbitrum", "ARB", "https://arbitrum.blockscout.com", "ETH", "#7bd88f"),
  cfg("polygon", "Polygon", "POLY", "https://polygon.blockscout.com", "POL", "#c9a0ff"),
  cfg("gnosis", "Gnosis", "GNO", "https://gnosis.blockscout.com", "xDAI", "#ffb224"),
];

export const CHAIN_MAP: Record<ChainId, ChainConfig> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c]),
) as Record<ChainId, ChainConfig>;

export const DEFAULT_CHAINS: ChainId[] = CHAINS.map((c) => c.id);
