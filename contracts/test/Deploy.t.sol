// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {BattleArena} from "../src/BattleArena.sol";
import {BrokerMonNFT} from "../src/BrokerMonNFT.sol";
import {SyntheticStock} from "../src/SyntheticStock.sol";

/// @dev Runs the real deploy script in-process (no network, dummy key) and checks wiring + JSON output + a live claim.
///      Env vars are process-global, so the scenarios run sequentially inside one test.
contract DeployTest is Test {
    uint256 internal constant DEPLOYER_PK = 0xDE9107E5;
    string internal constant OUT = "deployments/test-deploy.json";

    function test_deployScript() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        vm.setEnv("DEPLOYMENT_OUT", OUT);

        // 1. default signer (= deployer)
        Deploy.Deployment memory d = new Deploy().run();
        assertEq(BattleArena(d.arena).voucherSigner(), vm.addr(DEPLOYER_PK), "signer defaults to deployer");
        _checkWiring(d);
        _checkJson(d);
        _smokeClaim(d);
        vm.removeFile(OUT);

        // 2. custom signer via env
        address customSigner = makeAddr("game-server");
        vm.setEnv("VOUCHER_SIGNER", vm.toString(customSigner));
        Deploy.Deployment memory d2 = new Deploy().run();
        assertEq(BattleArena(d2.arena).voucherSigner(), customSigner);
        assertEq(BattleArena(d2.arena).owner(), vm.addr(DEPLOYER_PK));
        vm.removeFile(OUT);
    }

    function _checkWiring(Deploy.Deployment memory d) internal view {
        address deployer = vm.addr(DEPLOYER_PK);
        BattleArena arena = BattleArena(d.arena);
        BrokerMonNFT nft = BrokerMonNFT(d.brokerMon);
        string memory markets = vm.readFile("markets.json");

        assertEq(arena.owner(), deployer);
        assertEq(nft.owner(), deployer);
        assertEq(address(arena.pyth()), vm.parseJsonAddress(markets, ".pyth"));
        assertEq(address(arena.brokerMon()), d.brokerMon);
        assertEq(nft.minter(), d.arena);
        assertEq(d.tokens.length, 12);

        string[] memory symbols = abi.decode(vm.parseJson(markets, ".markets[*].symbol"), (string[]));
        string[] memory names = abi.decode(vm.parseJson(markets, ".markets[*].name"), (string[]));
        bytes32[] memory feeds = abi.decode(vm.parseJson(markets, ".markets[*].feedId"), (bytes32[]));
        uint256[] memory affs = abi.decode(vm.parseJson(markets, ".markets[*].affinity"), (uint256[]));
        for (uint256 i = 0; i < 12; ++i) {
            _checkMarket(d, i, symbols[i], names[i], feeds[i], affs[i]);
        }
    }

    function _checkMarket(
        Deploy.Deployment memory d,
        uint256 i,
        string memory symbol,
        string memory name,
        bytes32 feed,
        uint256 affinity
    ) internal view {
        SyntheticStock t = d.tokens[i];
        assertEq(t.symbol(), string.concat("s", symbol));
        assertEq(t.name(), string.concat("Synthetic ", name));
        assertEq(t.minter(), d.arena);
        assertEq(t.owner(), d.deployer);
        (SyntheticStock mt, bytes32 mfeed, bool active) = BattleArena(d.arena).markets(bytes32(bytes(symbol)));
        assertEq(address(mt), address(t));
        assertEq(mfeed, feed);
        assertTrue(active);
        // forge-lint: disable-next-line(unsafe-typecast)
        BrokerMonNFT.Species memory sp = BrokerMonNFT(d.brokerMon).speciesInfo(uint16(i + 1));
        assertEq(sp.symbol, symbol);
        assertEq(sp.name, name);
        assertEq(sp.affinity, affinity);
    }

    function _checkJson(Deploy.Deployment memory d) internal view {
        string memory json = vm.readFile(OUT);
        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonAddress(json, ".arena"), d.arena);
        assertEq(vm.parseJsonAddress(json, ".brokerMon"), d.brokerMon);
        assertEq(vm.parseJsonAddress(json, ".pyth"), d.pyth);
        assertEq(vm.parseJsonAddress(json, ".signer"), d.signer);
        assertEq(vm.parseJsonAddress(json, ".tokens.TSLA"), address(d.tokens[2]));
        assertEq(vm.parseJsonAddress(json, ".tokens.MSTR"), address(d.tokens[11]));
        assertEq(vm.parseJsonKeys(json, ".tokens").length, 12);
    }

    /// @dev A real claim works against the deployed system even though Pyth does not exist in this environment
    ///      (the oracle path degrades to stale/no-buff instead of reverting).
    function _smokeClaim(Deploy.Deployment memory d) internal {
        BattleArena arena = BattleArena(d.arena);
        BattleArena.Claim memory c = BattleArena.Claim({
            winner: makeAddr("winner"),
            loser: makeAddr("loser"),
            roomId: keccak256("deploy-smoke"),
            ticker: bytes32("TSLA"),
            baseAmount: 10e18,
            captureSpeciesId: 3,
            captureLevel: 5,
            deadline: uint64(block.timestamp + 1 hours)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEPLOYER_PK, arena.hashClaim(c));
        arena.claim(c, abi.encodePacked(r, s, v), new bytes[](0));
        assertEq(d.tokens[2].balanceOf(c.winner), 10e18);
        assertEq(BrokerMonNFT(d.brokerMon).ownerOf(1), c.winner);
        (int16 buff, bool stale) = arena.previewBuff(bytes32("TSLA"));
        assertEq(buff, 0);
        assertTrue(stale);
    }
}
