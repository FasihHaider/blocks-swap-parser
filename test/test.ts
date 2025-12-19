import assert from "assert";
import { TestHelpers, Transfer } from "generated";
const { MockDb, ERC20, Addresses } = TestHelpers;

describe("Transfers", () => {
  it("Transfer event saves correctly with tx hash, from, to, and amount", async () => {
    //Instantiate a mock DB
    const mockDbEmpty = MockDb.createMockDb();

    //Get mock addresses from helpers
    const userAddress1 = Addresses.mockAddresses[0];
    const userAddress2 = Addresses.mockAddresses[1];

    //Create a mock Transfer event from userAddress1 to userAddress2
    const mockTransfer = ERC20.Transfer.createMockEvent({
      from: userAddress1,
      to: userAddress2,
      value: 3n,
    });

    //Process the mockEvent
    //Note: processEvent functions do not mutate the mockDb, they return a new
    //mockDb with with modified state
    const mockDbAfterTransfer = await ERC20.Transfer.processEvent({
      event: mockTransfer,
      mockDb: mockDbEmpty,
    });

    //Get the transfer entity that was created
    const transferId = `${mockTransfer.transaction.hash}-${mockTransfer.logIndex}`;
    const savedTransfer = mockDbAfterTransfer.entities.Transfer.get(transferId);

    //Assert the transfer was saved
    assert.ok(savedTransfer, "Transfer should be saved");

    //Assert all required fields are present
    assert.equal(
      savedTransfer?.txHash,
      mockTransfer.transaction.hash,
      "Transaction hash should match",
    );
    assert.equal(
      savedTransfer?.from,
      userAddress1,
      "From address should match",
    );
    assert.equal(
      savedTransfer?.to,
      userAddress2,
      "To address should match",
    );
    assert.equal(
      savedTransfer?.amount,
      3n,
      "Amount should match",
    );
  });
});
