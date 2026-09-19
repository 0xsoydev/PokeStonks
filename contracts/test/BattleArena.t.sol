// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, stdStorage, StdStorage} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {MockPyth} from "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BattleArena} from "../src/BattleArena.sol";
import {SyntheticStock} from "../src/SyntheticStock.sol";
import {BrokerMonNFT} from "../src/BrokerMonNFT.sol";
import {ConfigurablePyth} from "./mocks/ConfigurablePyth.sol";
import {PickyRelayer, ReenteringRelayer} from "./mocks/Relayers.sol";

/// @dev Exposes the internal pure buff math for fuzzing.
contract ArenaHarness is BattleArena {
    constructor(address o, address p, address s, address n) BattleArena(o, p, s, n) {}

    function buffFromPrices(int256 spot, int256 ema) external pure returns (int16) {
        return _buffFromPrices(spot, ema);
    }
}

contract BattleArenaTest is Test {
    using stdStorage for StdStorage;

    // ---- fixtures ----
    uint256 internal constant SIGNER_PK = 0xA11CE;
    uint256 internal constant FEE = 1e12;
    uint64 internal constant NOW = 1_800_000_000;
    int32 internal constant EXPO = -8;
    int64 internal constant BASE_PX = 100e8;

    bytes32 internal constant TSLA = bytes32("TSLA");
    bytes32 internal constant AAPL = bytes32("AAPL");
    bytes32 internal constant TSLA_FEED = keccak256("feed.tsla");
    bytes32 internal constant AAPL_FEED = keccak256("feed.aapl");

    address internal signer;
    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    MockPyth internal pyth;
    SyntheticStock internal sTSLA;
    SyntheticStock internal sAAPL;
    BrokerMonNFT internal nft;
    BattleArena internal arena;

    event Claimed(
        bytes32 indexed roomId,
        address indexed winner,
        bytes32 indexed ticker,
        uint256 minted,
        int16 buffBps,
        bool priceStale,
        uint256 nftId
    );
    event Refunded(address indexed to, uint256 amount);
    event RefundDeferred(address indexed to, uint256 amount);
    event MarketSet(bytes32 indexed ticker, address token, bytes32 feedId, bool active);
    event VoucherSignerSet(address indexed signer);
    event PythSet(address indexed pyth);
    event BrokerMonSet(address indexed brokerMon);
    event MaxPriceAgeSet(uint256 maxPriceAge);

    function setUp() public virtual {
        vm.warp(NOW);
        signer = vm.addr(SIGNER_PK);
        pyth = new MockPyth(60, FEE);

        (uint16[] memory ids, string[] memory symbols, string[] memory names, uint8[] memory affs) = _species();
        nft = new BrokerMonNFT(owner, ids, symbols, names, affs);
        sTSLA = new SyntheticStock("Synthetic Tesla", "sTSLA", owner);
        sAAPL = new SyntheticStock("Synthetic Apple", "sAAPL", owner);
        arena = new BattleArena(owner, address(pyth), signer, address(nft));

        vm.startPrank(owner);
        nft.setMinter(address(arena));
        sTSLA.setMinter(address(arena));
        sAAPL.setMinter(address(arena));
        arena.setMarket(TSLA, address(sTSLA), TSLA_FEED, true);
        arena.setMarket(AAPL, address(sAAPL), AAPL_FEED, true);
        vm.stopPrank();

        vm.deal(relayer, 100 ether);
        vm.deal(alice, 100 ether);
    }

    // ---- helpers ----

    function _species()
        internal
        pure
        returns (uint16[] memory ids, string[] memory symbols, string[] memory names, uint8[] memory affs)
    {
        ids = new uint16[](3);
        symbols = new string[](3);
        names = new string[](3);
        affs = new uint8[](3);
        ids[0] = 1;
        symbols[0] = "AAPL";
        names[0] = "Apple";
        affs[0] = 0;
        ids[1] = 3;
        symbols[1] = "TSLA";
        names[1] = "Tesla";
        affs[1] = 1;
        ids[2] = 11;
        symbols[2] = "COIN";
        names[2] = "Coinbase";
        affs[2] = 5;
    }

    function _claim(bytes32 room) internal view returns (BattleArena.Claim memory c) {
        c = BattleArena.Claim({
            winner: alice,
            loser: bob,
            roomId: room,
            ticker: TSLA,
            baseAmount: 100e18,
            captureSpeciesId: 0,
            captureLevel: 0,
            deadline: uint64(block.timestamp + 1 hours)
        });
    }

    /// @dev Independent EIP-712 digest (does not use the contract's own hashing).
    function _digest(BattleArena.Claim memory c, address verifyingContract) internal view returns (bytes32) {
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PokeStonks"),
                keccak256("1"),
                block.chainid,
                verifyingContract
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Claim(address winner,address loser,bytes32 roomId,bytes32 ticker,uint256 baseAmount,uint16 captureSpeciesId,uint8 captureLevel,uint64 deadline)"
                ),
                c.winner,
                c.loser,
                c.roomId,
                c.ticker,
                c.baseAmount,
                c.captureSpeciesId,
                c.captureLevel,
                c.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    function _sign(BattleArena.Claim memory c, uint256 pk) internal view returns (bytes memory) {
        return _signFor(c, pk, address(arena));
    }

    function _signFor(BattleArena.Claim memory c, uint256 pk, address verifyingContract)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(c, verifyingContract));
        return abi.encodePacked(r, s, v);
    }

    function _noUpdate() internal pure returns (bytes[] memory u) {
        u = new bytes[](0);
    }

    function _update(bytes32 feed, int64 price, int64 emaPrice, uint64 publishTime)
        internal
        view
        returns (bytes[] memory u)
    {
        u = new bytes[](1);
        u[0] = pyth.createPriceFeedUpdateData(feed, price, 1, EXPO, emaPrice, 1, publishTime, 0);
    }

    /// @dev Seeds MockPyth directly with a price for TSLA.
    function _seed(int64 price, int64 emaPrice, uint64 publishTime) internal {
        pyth.updatePriceFeeds{value: FEE}(_update(TSLA_FEED, price, emaPrice, publishTime));
    }

    function _doClaim(BattleArena.Claim memory c) internal {
        vm.prank(relayer);
        arena.claim(c, _sign(c, SIGNER_PK), _noUpdate());
    }

    // =====================================================================
    // Happy path
    // =====================================================================

    function test_claim_happyPath_mintsTokensAndCapturesNft() public {
        _seed(BASE_PX, BASE_PX, NOW);
        BattleArena.Claim memory c = _claim(keccak256("room-1"));
        c.captureSpeciesId = 3;
        c.captureLevel = 7;

        vm.expectEmit(true, true, true, true, address(arena));
        emit Claimed(c.roomId, alice, TSLA, 100e18, 0, false, 1);
        vm.prank(relayer);
        arena.claim(c, _sign(c, SIGNER_PK), _noUpdate());

        assertEq(sTSLA.balanceOf(alice), 100e18);
        assertEq(sTSLA.totalSupply(), 100e18);
        assertTrue(arena.claimed(c.roomId));
        assertEq(arena.wins(alice), 1);
        assertEq(arena.losses(bob), 1);
        assertEq(arena.wins(bob), 0);
        assertEq(arena.totalMinted(alice), 100e18);
        assertEq(nft.ownerOf(1), alice);
        BrokerMonNFT.BrokerData memory d = nft.brokerData(1);
        assertEq(d.speciesId, 3);
        assertEq(d.level, 7);
        assertEq(d.roomId, c.roomId);
        assertEq(d.mintedAt, NOW);
    }

    function test_claim_noCapture_mintsNoNft() public {
        _seed(BASE_PX, BASE_PX, NOW);
        _doClaim(_claim(keccak256("room-2")));
        assertEq(nft.totalSupply(), 0);
        assertEq(nft.balanceOf(alice), 0);
    }

    function test_claim_relayerIsIrrelevant() public {
        BattleArena.Claim memory c = _claim(keccak256("r"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.prank(stranger);
        arena.claim(c, sig, _noUpdate());
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_claim_noLoser_recordsNoLoss() public {
        BattleArena.Claim memory c = _claim(keccak256("pve"));
        c.loser = address(0);
        _doClaim(c);
        assertEq(arena.wins(alice), 1);
        assertEq(arena.losses(address(0)), 0);
    }

    function test_claim_independentRooms() public {
        BattleArena.Claim memory c1 = _claim(keccak256("a"));
        BattleArena.Claim memory c2 = _claim(keccak256("b"));
        c2.ticker = AAPL;
        _doClaim(c1);
        _doClaim(c2);
        assertEq(sTSLA.balanceOf(alice), 100e18);
        assertEq(sAAPL.balanceOf(alice), 100e18);
        assertEq(arena.wins(alice), 2);
        assertEq(arena.totalMinted(alice), 200e18);
    }

    function test_claim_deadlineInclusive() public {
        BattleArena.Claim memory c = _claim(keccak256("dl"));
        c.deadline = uint64(block.timestamp);
        _doClaim(c);
        assertTrue(arena.claimed(c.roomId));
    }

    // =====================================================================
    // Rejections
    // =====================================================================

    function test_claim_replaySameRoom_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("dup"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.prank(relayer);
        arena.claim(c, sig, _noUpdate());
        vm.expectRevert(abi.encodeWithSelector(BattleArena.AlreadyClaimed.selector, c.roomId));
        vm.prank(relayer);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_replayWithFreshSignatureSameRoom_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("dup2"));
        _doClaim(c);
        c.baseAmount = 999e18;
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(BattleArena.AlreadyClaimed.selector, c.roomId));
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_wrongSigner_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("ws"));
        bytes memory sig = _sign(c, 0xBAD);
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());
        assertFalse(arena.claimed(c.roomId));
    }

    function test_claim_tamperedVoucher_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("tamper"));
        bytes memory sig = _sign(c, SIGNER_PK);
        c.baseAmount += 1;
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());

        c.baseAmount -= 1;
        c.winner = bob;
        c.loser = alice;
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_signatureForOtherContract_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("xdomain"));
        bytes memory sig = _signFor(c, SIGNER_PK, address(0xBEEF));
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_signatureForOtherChain_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("xchain"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.chainId(1234);
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_malformedSignature_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("bad-sig"));
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, hex"1234", _noUpdate());
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, "", _noUpdate());
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, new bytes(65), _noUpdate());
    }

    function test_claim_highSMalleableSignature_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("malleable"));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, _digest(c, address(arena)));
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 sHigh = bytes32(n - uint256(s));
        uint8 vFlip = v == 27 ? 28 : 27;
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, abi.encodePacked(r, sHigh, vFlip), _noUpdate());
    }

    function test_claim_expiredDeadline_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("exp"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.warp(uint256(c.deadline) + 1);
        vm.expectRevert(abi.encodeWithSelector(BattleArena.VoucherExpired.selector, c.deadline));
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_unknownMarket_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("um"));
        c.ticker = bytes32("NOPE");
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(BattleArena.MarketInactive.selector, c.ticker));
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_inactiveMarket_reverts() public {
        vm.prank(owner);
        arena.setMarket(TSLA, address(sTSLA), TSLA_FEED, false);
        BattleArena.Claim memory c = _claim(keccak256("im"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(BattleArena.MarketInactive.selector, TSLA));
        arena.claim(c, sig, _noUpdate());

        vm.prank(owner);
        arena.setMarket(TSLA, address(sTSLA), TSLA_FEED, true);
        arena.claim(c, sig, _noUpdate());
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_claim_paused_reverts() public {
        vm.prank(owner);
        arena.pause();
        BattleArena.Claim memory c = _claim(keccak256("p"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.claim(c, sig, _noUpdate());

        vm.prank(owner);
        arena.unpause();
        arena.claim(c, sig, _noUpdate());
        assertTrue(arena.claimed(c.roomId));
    }

    function test_claim_zeroWinner_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("zw"));
        c.winner = address(0);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_sameWinnerLoser_reverts() public {
        BattleArena.Claim memory c = _claim(keccak256("sw"));
        c.loser = alice;
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(BattleArena.SameWinnerLoser.selector);
        arena.claim(c, sig, _noUpdate());
    }

    function test_claim_unknownCaptureSpecies_revertsAtomically() public {
        BattleArena.Claim memory c = _claim(keccak256("uc"));
        c.captureSpeciesId = 99;
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.UnknownSpecies.selector, uint16(99)));
        arena.claim(c, sig, _noUpdate());
        assertFalse(arena.claimed(c.roomId));
        assertEq(sTSLA.balanceOf(alice), 0);
        assertEq(arena.wins(alice), 0);
    }

    function test_claim_tokenWithoutMinterRole_revertsAtomically() public {
        SyntheticStock rogue = new SyntheticStock("Synthetic X", "sX", owner);
        vm.prank(owner);
        arena.setMarket(bytes32("X"), address(rogue), keccak256("x"), true);
        BattleArena.Claim memory c = _claim(keccak256("nm"));
        c.ticker = bytes32("X");
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectRevert(abi.encodeWithSelector(SyntheticStock.NotMinter.selector, address(arena)));
        arena.claim(c, sig, _noUpdate());
        assertFalse(arena.claimed(c.roomId));
    }

    function test_claim_zeroBaseAmount_ok() public {
        BattleArena.Claim memory c = _claim(keccak256("z"));
        c.baseAmount = 0;
        _doClaim(c);
        assertEq(sTSLA.balanceOf(alice), 0);
        assertEq(arena.wins(alice), 1);
    }

    function test_counters_saturateInsteadOfBricking() public {
        stdstore.target(address(arena))
            .sig(arena.wins.selector)
            .with_key(alice)
            .checked_write(uint256(type(uint32).max));
        stdstore.target(address(arena))
            .sig(arena.losses.selector)
            .with_key(bob)
            .checked_write(uint256(type(uint32).max));
        assertEq(arena.wins(alice), type(uint32).max);
        _doClaim(_claim(keccak256("sat")));
        assertEq(arena.wins(alice), type(uint32).max);
        assertEq(arena.losses(bob), type(uint32).max);
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    // =====================================================================
    // Buff: through claim()
    // =====================================================================

    function test_buff_bull_viaPriceUpdate() public {
        BattleArena.Claim memory c = _claim(keccak256("bull"));
        bytes[] memory u = _update(TSLA_FEED, 110e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectEmit(true, true, true, true, address(arena));
        emit Claimed(c.roomId, alice, TSLA, 110e18, 1000, false, 0);
        vm.prank(relayer);
        arena.claim{value: FEE}(c, sig, u);
        assertEq(sTSLA.balanceOf(alice), 110e18);
        assertEq(arena.totalMinted(alice), 110e18);
    }

    function test_buff_bear_viaPriceUpdate() public {
        BattleArena.Claim memory c = _claim(keccak256("bear"));
        bytes[] memory u = _update(TSLA_FEED, 90e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectEmit(true, true, true, true, address(arena));
        emit Claimed(c.roomId, alice, TSLA, 90e18, -1000, false, 0);
        vm.prank(relayer);
        arena.claim{value: FEE}(c, sig, u);
        assertEq(sTSLA.balanceOf(alice), 90e18);
    }

    function test_buff_neutral_viaPriceUpdate() public {
        BattleArena.Claim memory c = _claim(keccak256("neutral"));
        bytes[] memory u = _update(TSLA_FEED, 101e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectEmit(true, true, true, true, address(arena));
        emit Claimed(c.roomId, alice, TSLA, 100e18, 0, false, 0);
        vm.prank(relayer);
        arena.claim{value: FEE}(c, sig, u);
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_buff_usesStoredPrice_whenNoPriceUpdateSupplied() public {
        _seed(120e8, 100e8, NOW);
        BattleArena.Claim memory c = _claim(keccak256("stored"));
        _doClaim(c);
        assertEq(sTSLA.balanceOf(alice), 110e18);
    }

    function test_buff_freshUpdateOverridesStoredPrice() public {
        _seed(120e8, 100e8, NOW - 100);
        BattleArena.Claim memory c = _claim(keccak256("override"));
        bytes[] memory u = _update(TSLA_FEED, 80e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.prank(relayer);
        arena.claim{value: FEE}(c, sig, u);
        assertEq(sTSLA.balanceOf(alice), 90e18);
    }

    function test_buff_thresholdBoundaries() public {
        // ema = 10_000, spot = 10_200 -> exactly +200 bps -> neutral; 10_201 -> +201 -> bull.
        _assertBuff(10_200, 10_000, 0);
        _assertBuff(10_201, 10_000, 1000);
        _assertBuff(9_800, 10_000, 0);
        _assertBuff(9_799, 10_000, -1000);
        // truncation toward zero: 200.99 bps counts as 200.
        _assertBuff(102_009, 100_000, 0);
        _assertBuff(102_010, 100_000, 1000);
    }

    function _assertBuff(int64 spot, int64 ema, int16 expected) internal {
        uint64 t = uint64(block.timestamp);
        MockPyth p = new MockPyth(60, 0);
        p.updatePriceFeeds(_updateOn(p, TSLA_FEED, spot, ema, t));
        vm.prank(owner);
        arena.setPyth(address(p));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, expected);
        assertFalse(stale);
    }

    function _updateOn(MockPyth p, bytes32 feed, int64 price, int64 emaPrice, uint64 t)
        internal
        pure
        returns (bytes[] memory u)
    {
        u = new bytes[](1);
        u[0] = p.createPriceFeedUpdateData(feed, price, 1, EXPO, emaPrice, 1, t, 0);
    }

    function test_buff_stalePrice_noRevert_buffZero() public {
        _seed(120e8, 100e8, NOW - 3 days - 1);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);

        BattleArena.Claim memory c = _claim(keccak256("stale"));
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.expectEmit(true, true, true, true, address(arena));
        emit Claimed(c.roomId, alice, TSLA, 100e18, 0, true, 0);
        arena.claim(c, sig, _noUpdate());
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_buff_weekendOldPrice_stillFreshWithinMaxAge() public {
        _seed(120e8, 100e8, NOW - 3 days);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 1000);
        assertFalse(stale);
    }

    function test_buff_noFeedEverPublished_isStaleNotRevert() public {
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
        _doClaim(_claim(keccak256("nofeed")));
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_buff_previewUnknownTicker_isStale() public view {
        (int16 buff, bool stale) = arena.previewBuff(bytes32("NOPE"));
        assertEq(buff, 0);
        assertTrue(stale);
    }

    function test_buff_previewMatchesClaim() public {
        _seed(115e8, 100e8, NOW);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 1000);
        assertFalse(stale);
        (buff, stale) = arena.previewBuff(AAPL);
        assertEq(buff, 0);
        assertTrue(stale);
    }

    function test_buff_nonPositiveEma_isStale() public {
        _seed(100e8, 0, NOW);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
        _doClaim(_claim(keccak256("ema0")));
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_buff_negativeEma_isStale() public {
        _seed(100e8, -5, NOW);
        (, bool stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_buff_nonPositiveSpot_isStale() public {
        _seed(0, 100e8, NOW);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
        _seed(-1, 100e8, NOW + 1);
        (buff, stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
    }

    function test_setMaxPriceAge_changesStaleness() public {
        _seed(120e8, 100e8, NOW - 2 hours);
        (, bool stale) = arena.previewBuff(TSLA);
        assertFalse(stale);
        vm.expectEmit(false, false, false, true, address(arena));
        emit MaxPriceAgeSet(1 hours);
        vm.prank(owner);
        arena.setMaxPriceAge(1 hours);
        (int16 buff,) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        (, stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_buff_futurePublishTime_countsAsFresh() public {
        _seed(120e8, 100e8, NOW + 30);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 1000);
        assertFalse(stale);
    }

    // ---- Configurable / hostile oracle ----

    function _useCfgPyth() internal returns (ConfigurablePyth p) {
        p = new ConfigurablePyth();
        vm.prank(owner);
        arena.setPyth(address(p));
    }

    function _px(int64 price, int32 expo, uint256 t) internal pure returns (ConfigurablePyth.Price memory) {
        return ConfigurablePyth.Price({price: price, conf: 1, expo: expo, publishTime: t});
    }

    function test_oracle_mismatchedExponents_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.set(_px(120e8, -8, NOW), _px(100e8, -6, NOW));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
    }

    function test_oracle_staleEmaButFreshSpot_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.set(_px(120e8, -8, NOW), _px(100e8, -8, NOW - 4 days));
        (, bool stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_oracle_pricesRevert_isStaleAndClaimSucceeds() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setFlags(true, false, false);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
        _doClaim(_claim(keccak256("orv")));
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_oracle_shortReturnData_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(abi.encode(uint256(1), uint256(2), uint256(3)));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);
        _doClaim(_claim(keccak256("short")));
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_oracle_longReturnData_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(abi.encode(int256(1), uint256(2), int256(-8), NOW, uint256(5)));
        (, bool stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_oracle_outOfRangePrice_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(abi.encode(int256(type(int64).max) + 1, uint256(1), int256(-8), uint256(NOW)));
        (, bool stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
        p.setRawPriceReturn(abi.encode(int256(type(int64).min) - 1, uint256(1), int256(-8), uint256(NOW)));
        (, stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_oracle_outOfRangeExpo_isStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(abi.encode(int256(100), uint256(1), int256(type(int32).max) + 1, uint256(NOW)));
        (, bool stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
        p.setRawPriceReturn(abi.encode(int256(100), uint256(1), int256(type(int32).min) - 1, uint256(NOW)));
        (, stale) = arena.previewBuff(TSLA);
        assertTrue(stale);
    }

    function test_oracle_wellFormedRawReturn_isNeutralNotStale() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(abi.encode(int256(100), uint256(1), int256(-8), uint256(NOW)));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertFalse(stale);
    }

    function test_oracle_noCodeAtPythAddress_claimStillWorks() public {
        vm.prank(owner);
        arena.setPyth(address(0xDEAD));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertEq(buff, 0);
        assertTrue(stale);

        BattleArena.Claim memory c = _claim(keccak256("nocode"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"deadbeef";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 1 ether}(c, sig, u);
        assertEq(sTSLA.balanceOf(alice), 100e18);
        // nothing may be sent to the non-contract; everything refunded.
        assertEq(address(0xDEAD).balance, 0);
        assertEq(relayer.balance, before);
    }

    function test_oracle_feeCallReverts_updateSkipped_fullRefund() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setFlags(false, true, false);
        BattleArena.Claim memory c = _claim(keccak256("feerev"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"01";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 1 ether}(c, sig, u);
        assertEq(relayer.balance, before);
        assertEq(p.updates(), 0);
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_oracle_feeMalformedReturn_updateSkipped() public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawFeeReturn(abi.encode(uint256(1), uint256(2)));
        BattleArena.Claim memory c = _claim(keccak256("feebad"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"01";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 1 ether}(c, sig, u);
        assertEq(relayer.balance, before);
        assertEq(p.updates(), 0);
    }

    function test_oracle_updateReverts_fullRefund_claimSucceeds() public {
        ConfigurablePyth p = _useCfgPyth();
        p.set(_px(120e8, -8, NOW), _px(100e8, -8, NOW));
        p.setFee(FEE);
        p.setFlags(false, false, true);
        BattleArena.Claim memory c = _claim(keccak256("updrev"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"01";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 5 * FEE}(c, sig, u);
        assertEq(relayer.balance, before, "nothing spent when update failed");
        assertEq(address(p).balance, 0);
        assertEq(sTSLA.balanceOf(alice), 110e18, "buff still read from stored price");
    }

    function test_oracle_updateSucceeds_chargesExactFee() public {
        ConfigurablePyth p = _useCfgPyth();
        p.set(_px(100e8, -8, NOW), _px(100e8, -8, NOW));
        p.setFee(FEE);
        BattleArena.Claim memory c = _claim(keccak256("upd"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"01";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 3 * FEE}(c, sig, u);
        assertEq(before - relayer.balance, FEE);
        assertEq(address(p).balance, FEE);
        assertEq(p.updates(), 1);
    }

    // =====================================================================
    // msg.value handling
    // =====================================================================

    function test_refund_overpaidPythFee() public {
        BattleArena.Claim memory c = _claim(keccak256("refund"));
        bytes[] memory u = _update(TSLA_FEED, 110e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.expectEmit(true, false, false, true, address(arena));
        emit Refunded(relayer, 4 * FEE);
        vm.prank(relayer);
        arena.claim{value: 5 * FEE}(c, sig, u);
        assertEq(before - relayer.balance, FEE, "only the pyth fee is spent");
        assertEq(address(arena).balance, 0);
        assertEq(address(pyth).balance, FEE);
        assertEq(sTSLA.balanceOf(alice), 110e18);
    }

    function test_refund_exactFee_noRefundEvent() public {
        BattleArena.Claim memory c = _claim(keccak256("exact"));
        bytes[] memory u = _update(TSLA_FEED, 110e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        vm.recordLogs();
        vm.prank(relayer);
        arena.claim{value: FEE}(c, sig, u);
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != Refunded.selector);
        }
        assertEq(address(arena).balance, 0);
    }

    function test_refund_insufficientFee_skipsUpdate_refundsAll() public {
        BattleArena.Claim memory c = _claim(keccak256("insuf"));
        bytes[] memory u = _update(TSLA_FEED, 110e8, 100e8, NOW);
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: FEE - 1}(c, sig, u);
        assertEq(relayer.balance, before);
        assertEq(address(arena).balance, 0);
        // update skipped: no price stored -> stale -> no buff
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_refund_garbageUpdateData_isCaught_refundsAll() public {
        BattleArena.Claim memory c = _claim(keccak256("garbage"));
        bytes[] memory u = new bytes[](1);
        u[0] = hex"deadbeef";
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 2 * FEE}(c, sig, u);
        assertEq(relayer.balance, before, "failed update costs nothing");
        assertEq(address(arena).balance, 0);
        assertTrue(arena.claimed(c.roomId));
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_refund_valueWithoutPriceUpdate_refundsAll() public {
        BattleArena.Claim memory c = _claim(keccak256("valonly"));
        bytes memory sig = _sign(c, SIGNER_PK);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        arena.claim{value: 1 ether}(c, sig, _noUpdate());
        assertEq(relayer.balance, before);
        assertEq(address(arena).balance, 0);
    }

    function test_refund_revertingClaimReturnsValue() public {
        BattleArena.Claim memory c = _claim(keccak256("revert-val"));
        bytes memory sig = _sign(c, 0xBAD);
        uint256 before = relayer.balance;
        vm.prank(relayer);
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim{value: 1 ether}(c, sig, _noUpdate());
        assertEq(relayer.balance, before);
        assertEq(address(arena).balance, 0);
    }

    function test_refund_failedRefund_isDeferred_thenWithdrawable() public {
        PickyRelayer pr = new PickyRelayer();
        vm.deal(address(pr), 0);
        BattleArena.Claim memory c = _claim(keccak256("picky"));
        bytes memory sig = _sign(c, SIGNER_PK);

        vm.expectEmit(true, false, false, true, address(arena));
        emit RefundDeferred(address(pr), 1 ether);
        vm.deal(relayer, 10 ether);
        vm.prank(relayer);
        pr.relay{value: 1 ether}(arena, c, sig, _noUpdate());

        assertTrue(arena.claimed(c.roomId), "claim itself must succeed");
        assertEq(sTSLA.balanceOf(alice), 100e18);
        assertEq(arena.pendingRefund(address(pr)), 1 ether);
        assertEq(address(arena).balance, 1 ether);

        vm.expectRevert(BattleArena.TransferFailed.selector);
        pr.withdraw(arena);
        assertEq(arena.pendingRefund(address(pr)), 1 ether, "failed withdraw keeps credit");

        pr.setAccept(true);
        pr.withdraw(arena);
        assertEq(arena.pendingRefund(address(pr)), 0);
        assertEq(address(pr).balance, 1 ether);
        assertEq(address(arena).balance, 0);

        vm.expectRevert(BattleArena.NothingToWithdraw.selector);
        pr.withdraw(arena);
    }

    function test_withdrawRefund_nothing_reverts() public {
        vm.expectRevert(BattleArena.NothingToWithdraw.selector);
        arena.withdrawRefund();
    }

    function test_withdrawRefund_worksWhilePaused() public {
        PickyRelayer pr = new PickyRelayer();
        BattleArena.Claim memory c = _claim(keccak256("pw"));
        bytes memory sig = _sign(c, SIGNER_PK);
        pr.relay{value: 0}(arena, c, sig, _noUpdate()); // no value: nothing deferred
        vm.deal(address(this), 1 ether);
        BattleArena.Claim memory c2 = _claim(keccak256("pw2"));
        bytes memory sig2 = _sign(c2, SIGNER_PK);
        pr.relay{value: 1 ether}(arena, c2, sig2, _noUpdate());
        vm.prank(owner);
        arena.pause();
        pr.setAccept(true);
        pr.withdraw(arena);
        assertEq(address(pr).balance, 1 ether);
    }

    function test_reentrancy_fromRefundCallback_isBlocked() public {
        ReenteringRelayer rr = new ReenteringRelayer();
        BattleArena.Claim memory c1 = _claim(keccak256("re1"));
        BattleArena.Claim memory c2 = _claim(keccak256("re2"));
        rr.arm(arena, c2, _sign(c2, SIGNER_PK));

        vm.deal(address(rr), 0);
        vm.deal(relayer, 10 ether);
        vm.prank(relayer);
        rr.relay{value: 1 ether}(c1, _sign(c1, SIGNER_PK), _noUpdate());

        assertTrue(rr.reentryAttempted());
        assertFalse(rr.reentered(), "nonReentrant must block the inner claim");
        assertFalse(arena.claimed(c2.roomId));
        assertTrue(arena.claimed(c1.roomId));
        assertEq(sTSLA.balanceOf(alice), 100e18);
        assertEq(address(rr).balance, 1 ether);
    }

    function test_arena_hasNoReceive_rejectsPlainEth() public {
        (bool ok,) = address(arena).call{value: 1}("");
        assertFalse(ok);
    }

    // =====================================================================
    // EIP-712
    // =====================================================================

    function test_eip712_hashClaimAndDomainMatchIndependentComputation() public view {
        BattleArena.Claim memory c = _claim(keccak256("h"));
        c.captureSpeciesId = 3;
        c.captureLevel = 9;
        assertEq(arena.hashClaim(c), _digest(c, address(arena)));
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PokeStonks"),
                keccak256("1"),
                block.chainid,
                address(arena)
            )
        );
        assertEq(arena.DOMAIN_SEPARATOR(), domainSep);
        assertEq(
            arena.CLAIM_TYPEHASH(),
            keccak256(
                "Claim(address winner,address loser,bytes32 roomId,bytes32 ticker,uint256 baseAmount,uint16 captureSpeciesId,uint8 captureLevel,uint64 deadline)"
            )
        );
    }

    function test_eip712_only65ByteSignaturesAccepted() public {
        BattleArena.Claim memory c = _claim(keccak256("compact"));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, _digest(c, address(arena)));
        bytes32 vs = bytes32((uint256(v - 27) << 255) | uint256(s));
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, abi.encodePacked(r, vs), _noUpdate());
        arena.claim(c, abi.encodePacked(r, s, v), _noUpdate());
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    function test_setVoucherSigner_rotatesAuthority() public {
        uint256 newPk = 0xB0B;
        vm.expectEmit(true, false, false, false, address(arena));
        emit VoucherSignerSet(vm.addr(newPk));
        vm.prank(owner);
        arena.setVoucherSigner(vm.addr(newPk));

        BattleArena.Claim memory c = _claim(keccak256("rot"));
        bytes memory oldSig = _sign(c, SIGNER_PK);
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, oldSig, _noUpdate());
        arena.claim(c, _sign(c, newPk), _noUpdate());
        assertEq(sTSLA.balanceOf(alice), 100e18);
    }

    // =====================================================================
    // Admin / access control
    // =====================================================================

    function test_admin_onlyOwner() public {
        bytes memory unauthorized = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.startPrank(stranger);
        vm.expectRevert(unauthorized);
        arena.setVoucherSigner(stranger);
        vm.expectRevert(unauthorized);
        arena.setMarket(TSLA, address(sTSLA), TSLA_FEED, true);
        vm.expectRevert(unauthorized);
        arena.setPyth(address(pyth));
        vm.expectRevert(unauthorized);
        arena.setMaxPriceAge(1);
        vm.expectRevert(unauthorized);
        arena.pause();
        vm.expectRevert(unauthorized);
        arena.unpause();
        vm.expectRevert(unauthorized);
        arena.setBrokerMon(address(nft));
        vm.expectRevert(unauthorized);
        arena.renounceOwnership();
        vm.expectRevert(unauthorized);
        arena.transferOwnership(stranger);
        vm.stopPrank();
    }

    function test_admin_signerAndOwnerCannotBeBypassed() public {
        // the voucher signer has no admin rights either
        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        arena.setVoucherSigner(signer);
    }

    function test_admin_zeroValuesRejected() public {
        vm.startPrank(owner);
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setVoucherSigner(address(0));
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setPyth(address(0));
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setBrokerMon(address(0));
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setMaxPriceAge(0);
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setMarket(bytes32(0), address(sTSLA), TSLA_FEED, true);
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setMarket(TSLA, address(0), TSLA_FEED, true);
        vm.expectRevert(BattleArena.ZeroValue.selector);
        arena.setMarket(TSLA, address(sTSLA), bytes32(0), true);
        // an inactive market may omit the feed
        arena.setMarket(TSLA, address(sTSLA), bytes32(0), false);
        vm.stopPrank();
    }

    function test_admin_setters_emitAndUpdate() public {
        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true, address(arena));
        emit MarketSet(bytes32("NEW"), address(sAAPL), keccak256("f"), true);
        arena.setMarket(bytes32("NEW"), address(sAAPL), keccak256("f"), true);
        (SyntheticStock t, bytes32 f, bool a) = arena.markets(bytes32("NEW"));
        assertEq(address(t), address(sAAPL));
        assertEq(f, keccak256("f"));
        assertTrue(a);

        vm.expectEmit(true, false, false, false, address(arena));
        emit PythSet(address(0x1234));
        arena.setPyth(address(0x1234));
        assertEq(address(arena.pyth()), address(0x1234));

        vm.expectEmit(true, false, false, false, address(arena));
        emit BrokerMonSet(address(0x5678));
        arena.setBrokerMon(address(0x5678));
        assertEq(address(arena.brokerMon()), address(0x5678));
        vm.stopPrank();
    }

    function test_admin_renounceOwnershipDisabled() public {
        vm.prank(owner);
        vm.expectRevert(BattleArena.RenounceDisabled.selector);
        arena.renounceOwnership();
        assertEq(arena.owner(), owner);
    }

    function test_admin_twoStepOwnershipTransfer() public {
        vm.prank(owner);
        arena.transferOwnership(alice);
        assertEq(arena.owner(), owner, "not yet transferred");
        assertEq(arena.pendingOwner(), alice);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        arena.acceptOwnership();

        vm.prank(alice);
        arena.acceptOwnership();
        assertEq(arena.owner(), alice);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        arena.pause();
    }

    function test_constructor_defaults_andZeroChecks() public {
        assertEq(arena.maxPriceAge(), 3 days);
        assertEq(address(arena.pyth()), address(pyth));
        assertEq(arena.voucherSigner(), signer);
        assertEq(address(arena.brokerMon()), address(nft));
        assertEq(arena.owner(), owner);
        assertFalse(arena.paused());

        vm.expectRevert(BattleArena.ZeroValue.selector);
        new BattleArena(owner, address(0), signer, address(nft));
        vm.expectRevert(BattleArena.ZeroValue.selector);
        new BattleArena(owner, address(pyth), address(0), address(nft));
        vm.expectRevert(BattleArena.ZeroValue.selector);
        new BattleArena(owner, address(pyth), signer, address(0));
    }

    // =====================================================================
    // Fuzz
    // =====================================================================

    /// @dev Pure math: never reverts, result in {-1000,0,1000}, matches an independent integer reference.
    function testFuzz_buffMath(int64 spot, int64 ema) public {
        ArenaHarness h = new ArenaHarness(owner, address(pyth), signer, address(nft));
        vm.assume(ema > 0 && spot > 0);
        int16 buff = h.buffFromPrices(spot, ema);
        assertTrue(buff == 0 || buff == 1000 || buff == -1000);

        int256 x = (int256(spot) - int256(ema)) * 10_000; // scaled numerator
        int16 expected = 0;
        if (x >= 201 * int256(ema)) expected = 1000;
        else if (x <= -201 * int256(ema)) expected = -1000;
        assertEq(buff, expected);
    }

    /// @dev End-to-end read path (MockPyth): previewBuff never reverts for any stored int64 prices/times.
    function testFuzz_previewBuff_neverReverts(int64 spot, int64 ema, uint64 publishTime, uint64 warpTo) public {
        vm.assume(publishTime > 0);
        warpTo = uint64(bound(warpTo, 1, type(uint64).max));
        vm.warp(warpTo);
        pyth.updatePriceFeeds{value: FEE}(_update(TSLA_FEED, spot, ema, publishTime));
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertTrue(buff == 0 || buff == 1000 || buff == -1000);
        if (stale) assertEq(buff, 0);
        if (spot <= 0 || ema <= 0) assertTrue(stale);
    }

    /// @dev Raw oracle garbage of any shape can never revert previewBuff.
    function testFuzz_previewBuff_garbageOracle_neverReverts(bytes calldata junk) public {
        ConfigurablePyth p = _useCfgPyth();
        p.setRawPriceReturn(junk);
        (int16 buff, bool stale) = arena.previewBuff(TSLA);
        assertTrue(buff == 0 || buff == 1000 || buff == -1000);
        if (stale) assertEq(buff, 0);
    }

    /// @dev Minted amount always equals base * (10000 + buff) / 10000 and claim never reverts on oracle state.
    function testFuzz_claim_mintedMatchesBuff(uint96 base, int64 spot, int64 ema, uint32 age) public {
        vm.assume(ema > 0 && spot > 0);
        uint64 t = uint64(block.timestamp) - uint64(bound(age, 0, 5 days));
        _seed(spot, ema, t);
        (int16 buff,) = arena.previewBuff(TSLA);
        BattleArena.Claim memory c = _claim(keccak256(abi.encode("fz", base, spot, ema, age)));
        c.baseAmount = base;
        _doClaim(c);
        uint256 expected = uint256(base) * uint256(int256(10_000) + int256(buff)) / 10_000;
        assertEq(sTSLA.balanceOf(alice), expected);
    }

    /// @dev Only the exact signer's signature for the exact voucher is accepted.
    function testFuzz_claim_wrongKeyNeverAccepted(uint256 pk) public {
        pk = bound(pk, 1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140);
        vm.assume(pk != SIGNER_PK);
        BattleArena.Claim memory c = _claim(keccak256("fz-key"));
        bytes memory sig = _sign(c, pk);
        vm.expectRevert(BattleArena.InvalidSignature.selector);
        arena.claim(c, sig, _noUpdate());
    }
}
