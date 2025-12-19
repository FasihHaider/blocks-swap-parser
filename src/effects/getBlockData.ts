import { S, createEffect } from "envio";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Create a public client for Base Mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/sRgqUZi3qU038g6Yr5_1S"),
});

// Define the effect to fetch block data with transactions
export const getBlockData = createEffect(
  {
    name: "getBlockData",
    input: {
      blockNumber: S.number,
    },
    output: {
      hash: S.string,
      timestamp: S.number,
      transactions: S.array(S.string),
    },
    rateLimit: false,
    cache: false, // Don't cache block data as it's unique per block
  },
  async ({ input, context }) => {
    try {
      const block = await publicClient.getBlock({
        blockNumber: BigInt(input.blockNumber),
        includeTransactions: true,
      });

      // Extract transaction hashes
      const txHashes: string[] = block.transactions.map((tx) => {
        if (typeof tx === "string") {
          return tx;
        }
        return tx.hash;
      });

      return {
        hash: block.hash,
        timestamp: Number(block.timestamp),
        transactions: txHashes,
      };
    } catch (error) {
      context.log.error(
        `Error fetching block data for block ${input.blockNumber}: ${error}`
      );
      throw error;
    }
  }
);

