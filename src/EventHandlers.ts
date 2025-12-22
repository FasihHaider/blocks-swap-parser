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

          // Collect all token contract addresses (these are contracts we should exclude)
          const tokenContracts = new Set<string>();
          for (const transfer of transfers) {
            tokenContracts.add(transfer.token.toLowerCase());
          }

          // Track addresses that appear as intermediaries (both send and receive the same token)
          // This helps identify pool/router contracts
          const intermediaryAddresses = new Set<string>();
          const addressTokenTransfers = new Map<string, Map<string, { sent: bigint; received: bigint }>>();

          // Track first send and last receive per address
          // Map: address -> { firstSendIndex, firstSendToken, firstSendAmount, lastReceiveIndex, lastReceiveToken, lastReceiveAmount }
          const addressSwapEvents = new Map<string, {
            firstSendIndex: number | null;
            firstSendToken: string | null;
            firstSendAmount: bigint;
            lastReceiveIndex: number | null;
            lastReceiveToken: string | null;
            lastReceiveAmount: bigint;
          }>();

          // Process transfers in order to find first send and last receive
          for (let i = 0; i < transfers.length; i++) {
            const transfer = transfers[i];
            const from = transfer.from.toLowerCase();
            const to = transfer.to.toLowerCase();
            const token = transfer.token.toLowerCase();
            const amount = BigInt(transfer.amount);

            // Track transfers per address per token to identify intermediaries
            if (!addressTokenTransfers.has(from)) {
              addressTokenTransfers.set(from, new Map());
            }
            if (!addressTokenTransfers.has(to)) {
              addressTokenTransfers.set(to, new Map());
            }

            const fromTransfers = addressTokenTransfers.get(from)!;
            const toTransfers = addressTokenTransfers.get(to)!;

            if (!fromTransfers.has(token)) {
              fromTransfers.set(token, { sent: BigInt(0), received: BigInt(0) });
            }
            if (!toTransfers.has(token)) {
              toTransfers.set(token, { sent: BigInt(0), received: BigInt(0) });
            }

            fromTransfers.get(token)!.sent += amount;
            toTransfers.get(token)!.received += amount;

            // Track first send for 'from' address
            if (!addressSwapEvents.has(from)) {
              addressSwapEvents.set(from, {
                firstSendIndex: null,
                firstSendToken: null,
                firstSendAmount: BigInt(0),
                lastReceiveIndex: null,
                lastReceiveToken: null,
                lastReceiveAmount: BigInt(0),
              });
            }
            const fromSwapEvent = addressSwapEvents.get(from)!;
            // Record the first time this address sends a token
            if (fromSwapEvent.firstSendIndex === null) {
              fromSwapEvent.firstSendIndex = i;
              fromSwapEvent.firstSendToken = token;
              fromSwapEvent.firstSendAmount = amount;
            }

            // Track last receive for 'to' address
            if (!addressSwapEvents.has(to)) {
              addressSwapEvents.set(to, {
                firstSendIndex: null,
                firstSendToken: null,
                firstSendAmount: BigInt(0),
                lastReceiveIndex: null,
                lastReceiveToken: null,
                lastReceiveAmount: BigInt(0),
              });
            }
            const toSwapEvent = addressSwapEvents.get(to)!;
            // Always update last receive (it's the most recent receive)
            toSwapEvent.lastReceiveIndex = i;
            toSwapEvent.lastReceiveToken = token;
            toSwapEvent.lastReceiveAmount = amount;
          }

          // Identify intermediary addresses (contracts that both send and receive the same token)
          for (const [address, tokenTransfers] of addressTokenTransfers.entries()) {
            for (const [token, transfers] of tokenTransfers.entries()) {
              // If an address both sent and received the same token, it's likely an intermediary
              if (transfers.sent > BigInt(0) && transfers.received > BigInt(0)) {
                intermediaryAddresses.add(address);
              }
            }
          }

          // Detect swap patterns: first send and last receive must be different tokens
          // Collect all swappers in this transaction first
          const swappers: Array<{
            address: string;
            tokenIn: { token: string; amount: bigint };
            tokenOut: { token: string; amount: bigint };
          }> = [];

          for (const [address, swapEvent] of addressSwapEvents.entries()) {
            // Skip token contracts (they appear as token addresses in transfers)
            if (tokenContracts.has(address)) {
              continue;
            }

            // Skip intermediary contracts (addresses that both send and receive the same token)
            if (intermediaryAddresses.has(address)) {
              continue;
            }

            // A swap occurs when an address has:
            // 1. First send event (first transfer where they sent a token)
            // 2. Last receive event (last transfer where they received a token)
            // 3. Different tokens in first send and last receive
            // 4. First send happened before last receive
            if (
              swapEvent.firstSendIndex !== null &&
              swapEvent.firstSendToken !== null &&
              swapEvent.lastReceiveIndex !== null &&
              swapEvent.lastReceiveToken !== null &&
              swapEvent.firstSendToken !== swapEvent.lastReceiveToken &&
              swapEvent.firstSendIndex < swapEvent.lastReceiveIndex
            ) {
              // Collect this swapper
              swappers.push({
                address,
                tokenIn: {
                  token: swapEvent.firstSendToken,
                  amount: swapEvent.firstSendAmount,
                },
                tokenOut: {
                  token: swapEvent.lastReceiveToken,
                  amount: swapEvent.lastReceiveAmount,
                },
              });
            }
          }

          // Create only one Swap entity per transaction
          // Use the first swapper's token pair
          if (swappers.length > 0) {
            const primarySwapper = swappers[0];

            // Get token decimals (use primary swapper's tokens)
            const tokenInDecimals = await context.effect(
              getTokenDecimals,
              primarySwapper.tokenIn.token
            );
            const tokenOutDecimals = await context.effect(
              getTokenDecimals,
              primarySwapper.tokenOut.token
            );

            // Create swap entity (one per transaction)
            const swap: Swap = {
              id: txHash, // Use transaction hash as ID (one swap per tx)
              txHash: txHash,
              swapper: primarySwapper.address,
              tokenIn: primarySwapper.tokenIn.token,
              tokenInDecimals: tokenInDecimals,
              amountIn: primarySwapper.tokenIn.amount,
              tokenOut: primarySwapper.tokenOut.token,
              tokenOutDecimals: tokenOutDecimals,
              amountOut: primarySwapper.tokenOut.amount,
              blockNumber: BigInt(block.number),
              timestamp: BigInt(blockData.timestamp),
            };

            context.Swap.set(swap);
            swapCount++;
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
