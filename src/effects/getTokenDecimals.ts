import { S, createEffect } from "envio";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

// ERC20 ABI for decimals function
const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
]);

// Create a public client for Base Mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/sRgqUZi3qU038g6Yr5_1S"),
});

// Define the effect to fetch token decimals
export const getTokenDecimals = createEffect(
  {
    name: "getTokenDecimals",
    input: S.string, // Token contract address
    output: S.number, // Decimals as number
    rateLimit: false,
    cache: true, // Cache results for performance
  },
  async ({ input: tokenAddress, context }) => {
    try {
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      });

      return Number(decimals);
    } catch (error) {
      context.log.error(
        `Error fetching decimals for token ${tokenAddress}: ${error}`
      );
      // Return default value of 18 (most common) on error
      return 18;
    }
  }
);

