import type { HardhatUserConfig } from "hardhat/config";
import { configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

/// Mezo testnet. Chain ID and RPC confirmed live via eth_chainId -> 0x7b7b (31611).
export const MEZO_TESTNET_RPC = "https://rpc.test.mezo.org";
export const MEZO_TESTNET_CHAIN_ID = 31611;
export const MEZO_MAINNET_CHAIN_ID = 31612;

export default {
  plugins: [hardhatToolboxViem],

  solidity: {
    // Matches mezo-org/tigris and mezo-org/musd exactly. Their configs carry the
    // comment "latest EVM version supported on Mezo is London" -- so we must NOT
    // compile for shanghai/cancun, or solc emits PUSH0 and deployment reverts
    // on-chain. Confirmed independently: Mezo blocks carry baseFeePerGas but no
    // withdrawalsRoot / blobGasUsed / parentBeaconBlockRoot.
    version: "0.8.24",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: true, runs: 100 },
    },
  },

  // EDR has no built-in hardfork history for Mezo, so forking fails with
  // "No known hardfork for execution on historical block" without this.
  chainDescriptors: {
    [MEZO_TESTNET_CHAIN_ID]: {
      name: "Mezo Testnet",
      chainType: "l1",
      hardforkHistory: { shanghai: { blockNumber: 0 } },
      blockExplorers: {
        blockscout: {
          name: "Mezo Testnet Explorer",
          url: "https://explorer.test.mezo.org",
          apiUrl: "https://explorer.test.mezo.org/api",
        },
      },
    },
    [MEZO_MAINNET_CHAIN_ID]: {
      name: "Mezo",
      chainType: "l1",
      hardforkHistory: { shanghai: { blockNumber: 0 } },
      blockExplorers: {
        blockscout: {
          name: "Mezo Explorer",
          url: "https://explorer.mezo.org",
          apiUrl: "https://explorer.mezo.org/api",
        },
      },
    },
  },

  networks: {
    // Fork of Mezo testnet, so tests exercise the REAL VeBTC / VeBTCVoter /
    // Router rather than mocks.
    // Fork notes, learned the hard way:
    //  - `hardforkHistory` is required; EDR has no built-in history for 31611.
    //  - It must be `shanghai`: Mezo's system contracts (e.g. the BTC facade at
    //    0x7b7C..0000) are compiled with PUSH0. `london` fails with "invalid opcode".
    //  - It must NOT be `cancun`: Mezo blocks carry no excessBlobGas, so EDR
    //    rejects every call with "`excess_blob_gas` not set".
    //  - The BTC facade still cannot execute on a fork even under shanghai: it is
    //    backed by Cosmos bank-module state hooks in `mezod` that EDR cannot
    //    reproduce. Tests substitute a plain ERC-20 at that address; see
    //    test/helpers.ts. Every other Mezo contract is used as deployed.
    mezoFork: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: MEZO_TESTNET_CHAIN_ID,
      hardfork: "shanghai",
      forking: { url: MEZO_TESTNET_RPC },
      allowUnlimitedContractSize: true,
    },

    // Plain in-memory chain for unit tests that need no Mezo state.
    local: {
      type: "edr-simulated",
      chainType: "l1",
      hardfork: "shanghai",
      allowUnlimitedContractSize: true,
    },

    mezoTestnet: {
      type: "http",
      chainType: "l1",
      url: MEZO_TESTNET_RPC,
      chainId: MEZO_TESTNET_CHAIN_ID,
      accounts: [configVariable("MEZO_DEPLOYER_PRIVATE_KEY")],
    },
  },
} satisfies HardhatUserConfig;
