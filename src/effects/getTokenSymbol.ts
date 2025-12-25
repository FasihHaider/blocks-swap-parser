import { S, createEffect } from "envio";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

// ERC20 ABI for symbol function
const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
]);

// Create a public client for Base Mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/RFG7GT9Sif7oLTu1P5e4E"),
});

// Define the effect to fetch token symbol
export const getTokenSymbol = createEffect(
  {
    name: "getTokenSymbol",
    input: S.string, // Token contract address
    output: S.string, // Symbol as string
    rateLimit: false,
    cache: true, // Cache results for performance
  },
  async ({ input: tokenAddress, context }) => {
    try {
      const symbol = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
      });

      return symbol;
    } catch (error) {
      context.log.error(
        `Error fetching symbol for token ${tokenAddress}: ${error}`
      );
      // Return default value of "UNKNOWN" on error
      return "UNKNOWN";
    }
  }
);

