// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {SyntheticStock} from "../src/SyntheticStock.sol";
import {BrokerMonNFT} from "../src/BrokerMonNFT.sol";
import {BattleArena} from "../src/BattleArena.sol";

/// @title Deploy
/// @notice Deploys the full PokeStonks on-chain layer from `markets.json`.
/// @dev Env:
///        PRIVATE_KEY        (required) deployer key; becomes owner of every contract.
///        VOUCHER_SIGNER     (optional) game-server signing address; defaults to the deployer.
///        DEPLOYMENT_OUT     (optional) output path; defaults to `deployments/<chainid>.json`.
///        WRITE_DEPLOYMENT   (optional) set to `true` to write the JSON even during a dry run
///                           (by default it is only written when actually broadcasting).
///      Pyth is only stored by the arena, never called during deployment, so simulation works offline.
///
///      Usage (testnet):  forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    struct Deployment {
        address arena;
        address brokerMon;
        address pyth;
        address signer;
        address deployer;
        SyntheticStock[] tokens;
        string[] symbols;
    }

    /// @dev Parsed content of markets.json (index-aligned arrays).
    struct Markets {
        address pyth;
        uint16[] ids;
        string[] symbols;
        string[] names;
        uint8[] affinities;
        bytes32[] feedIds;
    }

    /// @notice Entry point.
    function run() external returns (Deployment memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address signer = vm.envOr("VOUCHER_SIGNER", deployer);
        Markets memory m = _readMarkets();

        vm.startBroadcast(pk);

        BrokerMonNFT nft = new BrokerMonNFT(deployer, m.ids, m.symbols, m.names, m.affinities);
        BattleArena arena = new BattleArena(deployer, m.pyth, signer, address(nft));
        nft.setMinter(address(arena));

        SyntheticStock[] memory tokens = new SyntheticStock[](m.symbols.length);
        for (uint256 i = 0; i < m.symbols.length; ++i) {
            tokens[i] = _deployMarket(arena, deployer, m.symbols[i], m.names[i], m.feedIds[i]);
        }

        vm.stopBroadcast();

        d = Deployment({
            arena: address(arena),
            brokerMon: address(nft),
            pyth: m.pyth,
            signer: signer,
            deployer: deployer,
            tokens: tokens,
            symbols: m.symbols
        });

        _log(d);

        if (!vm.isContext(VmSafe.ForgeContext.ScriptDryRun) || vm.envOr("WRITE_DEPLOYMENT", false)) {
            _write(d);
        } else {
            console2.log("Dry run: deployment JSON not written (set WRITE_DEPLOYMENT=true to force).");
        }
    }

    /// @dev Deploys one sSTOCK token, hands its minter role to the arena and registers the market.
    function _deployMarket(
        BattleArena arena,
        address deployer,
        string memory symbol,
        string memory name,
        bytes32 feedId
    ) internal returns (SyntheticStock t) {
        t = new SyntheticStock(string.concat("Synthetic ", name), string.concat("s", symbol), deployer);
        t.setMinter(address(arena));
        arena.setMarket(bytes32(bytes(symbol)), address(t), feedId, true);
    }

    /// @dev Reads and validates markets.json.
    function _readMarkets() internal view returns (Markets memory m) {
        string memory json = vm.readFile("markets.json");
        m.pyth = vm.parseJsonAddress(json, ".pyth");
        m.symbols = abi.decode(vm.parseJson(json, ".markets[*].symbol"), (string[]));
        m.names = abi.decode(vm.parseJson(json, ".markets[*].name"), (string[]));
        m.feedIds = abi.decode(vm.parseJson(json, ".markets[*].feedId"), (bytes32[]));
        uint256[] memory speciesIds = abi.decode(vm.parseJson(json, ".markets[*].speciesId"), (uint256[]));
        uint256[] memory affinities = abi.decode(vm.parseJson(json, ".markets[*].affinity"), (uint256[]));

        uint256 n = m.symbols.length;
        require(
            n > 0 && m.names.length == n && speciesIds.length == n && affinities.length == n && m.feedIds.length == n,
            "markets.json: inconsistent arrays"
        );
        m.ids = new uint16[](n);
        m.affinities = new uint8[](n);
        for (uint256 i = 0; i < n; ++i) {
            require(speciesIds[i] <= type(uint16).max && affinities[i] <= type(uint8).max, "markets.json: range");
            // forge-lint: disable-next-line(unsafe-typecast)
            m.ids[i] = uint16(speciesIds[i]);
            // forge-lint: disable-next-line(unsafe-typecast)
            m.affinities[i] = uint8(affinities[i]);
        }
    }

    /// @dev Prints the deployment summary.
    function _log(Deployment memory d) internal pure {
        console2.log("BattleArena:", d.arena);
        console2.log("BrokerMonNFT:", d.brokerMon);
        console2.log("Pyth:", d.pyth);
        console2.log("Voucher signer:", d.signer);
        for (uint256 i = 0; i < d.tokens.length; ++i) {
            console2.log(string.concat("  s", d.symbols[i], ":"), address(d.tokens[i]));
        }
    }

    /// @dev Writes the deployment record as JSON.
    function _write(Deployment memory d) internal {
        string memory tokensKey = "pokestonks.tokens";
        string memory tokensJson = "{}";
        for (uint256 i = 0; i < d.tokens.length; ++i) {
            tokensJson = vm.serializeAddress(tokensKey, d.symbols[i], address(d.tokens[i]));
        }

        string memory root = "pokestonks.root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "arena", d.arena);
        vm.serializeAddress(root, "brokerMon", d.brokerMon);
        vm.serializeAddress(root, "pyth", d.pyth);
        vm.serializeAddress(root, "signer", d.signer);
        vm.serializeAddress(root, "deployer", d.deployer);
        string memory out = vm.serializeUint(root, "deployBlock", block.number);

        string memory path =
            vm.envOr("DEPLOYMENT_OUT", string.concat("deployments/", vm.toString(block.chainid), ".json"));
        vm.createDir("deployments", true);
        vm.writeJson(out, path);
        vm.writeJson(tokensJson, path, ".tokens");
        console2.log("Wrote", path);
    }
}
