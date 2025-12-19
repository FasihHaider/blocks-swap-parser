import { ERC20, Transfer, onBlock, Block, Swap } from "generated";
import { getTokenDecimals } from "./effects/getTokenDecimals";
import { getBlockData } from "./effects/getBlockData";
import { getTransactionReceipt } from "./effects/getTransactionReceipt";

ERC20.Transfer.handler(async ({ event, context }) => {
  // Create a unique ID using transaction hash and log index
  const transferId = `${event.transaction.hash}-${event.logIndex}`;

  // Fetch token decimals using Effect API
  const decimals = await context.effect(getTokenDecimals, event.srcAddress);

  const transfer: Transfer = {
    id: transferId,
    txHash: event.transaction.hash,
    token: event.srcAddress,
    decimals: decimals,
    from: event.params.from.toString(),
    to: event.params.to.toString(),
    amount: event.params.value,
  };

  context.Transfer.set(transfer);
}, {wildcard: true});

// Block handler to capture all transactions and detect swaps
onBlock(
  {
    name: "BlockTransactions",
    chain: 8453, // Base Mainnet
  },
  async ({ block, context }) => {
    // Skip during preload to avoid double processing
    if (context.isPreload) return;

    try {
      // Fetch block data with transactions using Effect API
      const blockData = await context.effect(getBlockData, {
        blockNumber: block.number,
      });

      const blockEntity: Block = {
        id: block.number.toString(),
        number: BigInt(block.number),
        hash: blockData.hash,
        timestamp: BigInt(blockData.timestamp),
        txCount: blockData.transactions.length,
        txHashes: blockData.transactions.join(","),
      };

      context.Block.set(blockEntity);

      // Process each transaction to detect swaps
      let swapCount = 0;
      for (const txHash of blockData.transactions) {
        try {
          // Get transaction receipt with Transfer events
          const receiptDataJson = await context.effect(getTransactionReceipt, {
            txHash: txHash,
          });

          const transfers: Array<{
            from: string;
            to: string;
            token: string;
            amount: string;
          }> = JSON.parse(receiptDataJson);

          // Filter transactions with at least 2 Transfer events
          if (transfers.length < 2) {
            continue;
          }

          // Calculate net token changes per address
          // Map: address -> token -> net change (positive = gained, negative = lost)
          const netChanges = new Map<string, Map<string, bigint>>();

          // Process all transfers to calculate net changes
          for (const transfer of transfers) {
            const from = transfer.from.toLowerCase();
            const to = transfer.to.toLowerCase();
            const token = transfer.token.toLowerCase();
            const amount = BigInt(transfer.amount);

            // Decrease balance for sender
            if (!netChanges.has(from)) {
              netChanges.set(from, new Map<string, bigint>());
            }
            const fromBalances = netChanges.get(from)!;
            const currentFromBalance = fromBalances.get(token) || BigInt(0);
            fromBalances.set(token, currentFromBalance - amount);

            // Increase balance for receiver
            if (!netChanges.has(to)) {
              netChanges.set(to, new Map<string, bigint>());
            }
            const toBalances = netChanges.get(to)!;
            const currentToBalance = toBalances.get(token) || BigInt(0);
            toBalances.set(token, currentToBalance + amount);
          }

          // Detect swap patterns: addresses that lost one token and gained another
          for (const [address, tokenBalances] of netChanges.entries()) {
            const tokensLost: Array<{ token: string; amount: bigint }> = [];
            const tokensGained: Array<{ token: string; amount: bigint }> = [];

            // Separate tokens into lost (negative net) and gained (positive net)
            for (const [token, netChange] of tokenBalances.entries()) {
              if (netChange < 0) {
                // Address lost this token (sent more than received)
                tokensLost.push({ token, amount: -netChange }); // Convert to positive amount
              } else if (netChange > 0) {
                // Address gained this token (received more than sent)
                tokensGained.push({ token, amount: netChange });
              }
              // If netChange === 0, the address broke even (not a swap)
            }

            // A swap occurs when an address lost at least one token and gained at least one different token
            if (tokensLost.length > 0 && tokensGained.length > 0) {
              // Match the first lost token with the first gained token
              // In complex swaps, there might be multiple pairs, but we'll capture the primary one
              const tokenIn = tokensLost[0];
              const tokenOut = tokensGained[0];

              // Skip if somehow the same token (shouldn't happen, but safety check)
              if (tokenIn.token === tokenOut.token) {
                continue;
              }

              // Get token decimals
              const tokenInDecimals = await context.effect(
                getTokenDecimals,
                tokenIn.token
              );
              const tokenOutDecimals = await context.effect(
                getTokenDecimals,
                tokenOut.token
              );

              // Create swap entity
              const swap: Swap = {
                id: `${txHash}-${address}`,
                txHash: txHash,
                swapper: address,
                tokenIn: tokenIn.token,
                tokenInDecimals: tokenInDecimals,
                amountIn: tokenIn.amount,
                tokenOut: tokenOut.token,
                tokenOutDecimals: tokenOutDecimals,
                amountOut: tokenOut.amount,
                blockNumber: BigInt(block.number),
                timestamp: BigInt(blockData.timestamp),
              };

              context.Swap.set(swap);
              swapCount++;
            }
          }
        } catch (error) {
          context.log.error(
            `Error processing transaction ${txHash} in block ${block.number}: ${error}`
          );
          // Continue processing other transactions
        }
      }

      context.log.info(
        `Processed block ${block.number} with ${blockData.transactions.length} transactions, detected ${swapCount} swaps`
      );
    } catch (error) {
      context.log.error(
        `Error processing block ${block.number}: ${error}`
      );
    }
  }
);
