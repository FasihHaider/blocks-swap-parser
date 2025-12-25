import { S, createEffect } from "envio";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

// Type for token info
export type TokenInfo = {
  symbol: string;
  decimals: number;
};

// ERC20 ABI for symbol and decimals functions
const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

// Create a public client for Base Mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/ALCHEMY_KEY_HERE"),
});

// Define the effect to fetch token symbol and decimals together
export const getTokenInfo = createEffect(
  {
    name: "getTokenInfo",
    input: S.string, // Token contract address
    output: {
      symbol: S.string,
      decimals: S.number,
    },
    rateLimit: false,
    cache: false, // Cache results for performance
  },
  async ({ input: tokenAddress, context }) => {
    try {
      // Fetch both symbol and decimals in parallel
      const [symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
      ]);

      return {
        symbol: symbol,
        decimals: Number(decimals),
      };
    } catch (error) {
      context.log.error(
        `Error fetching token info for ${tokenAddress}: ${error}`
      );
      // Return default values on error
      return {
        symbol: "UNKNOWN",
        decimals: 18,
      };
    }
  }
);

