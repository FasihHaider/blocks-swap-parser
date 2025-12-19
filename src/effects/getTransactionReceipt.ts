import { S, createEffect } from "envio";
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";
import { base } from "viem/chains";

// Create a public client for Base Mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/sRgqUZi3qU038g6Yr5_1S"),
});

// ERC20 Transfer event ABI
const TRANSFER_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// Transfer event data structure
export interface TransferEvent {
  from: string;
  to: string;
  token: string;
  amount: bigint;
}

// Define the effect to fetch transaction receipt with Transfer event logs
export const getTransactionReceipt = createEffect(
  {
    name: "getTransactionReceipt",
    input: {
      txHash: S.string,
    },
    output: S.string, // JSON string of transfers array
    rateLimit: false,
    cache: false, // Don't cache transaction receipts
  },
  async ({ input, context }) => {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: input.txHash as `0x${string}`,
      });

      // Parse Transfer events from logs
      const transfers: TransferEvent[] = [];
      
      for (const log of receipt.logs) {
        try {
          // Try to decode as Transfer event
          const decoded = decodeEventLog({
            abi: TRANSFER_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "Transfer") {
            transfers.push({
              from: decoded.args.from.toLowerCase(),
              to: decoded.args.to.toLowerCase(),
              token: log.address.toLowerCase(),
              amount: decoded.args.value,
            });
          }
        } catch (error) {
          // Not a Transfer event, skip
          continue;
        }
      }

      // Convert to JSON string
      const transfersData = transfers.map((t) => ({
        from: t.from,
        to: t.to,
        token: t.token,
        amount: t.amount.toString(),
      }));
      
      return JSON.stringify(transfersData);
    } catch (error) {
      context.log.error(
        `Error fetching transaction receipt for ${input.txHash}: ${error}`
      );
      return JSON.stringify([]);
    }
  }
);

