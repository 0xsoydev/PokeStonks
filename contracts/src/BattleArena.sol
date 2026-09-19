// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

import {SyntheticStock} from "./SyntheticStock.sol";
import {BrokerMonNFT} from "./BrokerMonNFT.sol";

/// @title BattleArena
/// @notice On-chain settlement layer of PokeStonks (Monad testnet). Battles are played 1v1 off-chain
///         on an authoritative server; the winner is rewarded with synthetic stock tokens (and
///         optionally a BrokerMon NFT) by redeeming an EIP-712 voucher signed by the game server.
/// @dev SYNTHETIC, TESTNET-ONLY. Rewards are game tokens with no monetary value; nothing here is a
///      real security or represents a real asset.
///
///      Trust model
///      - `voucherSigner` (the game server key) is the sole authority on who won and how much.
///        Anyone may relay a voucher; `msg.sender` is irrelevant to authorization.
///      - The Pyth price is *not* trusted from the caller: the caller may push a Pyth update, but the
///        buff is derived from whatever Pyth stores on-chain (spot vs. EMA), whose updates Pyth
///        itself verifies. If Pyth is unavailable, stale, or malformed the buff is 0; a claim never
///        reverts because of the oracle (equity feeds are stale on weekends).
///
///      Monad parallelism: replay protection is a per-room mapping, so claims for different rooms
///      touch disjoint storage (aside from per-player counters). There are deliberately NO global
///      counters written on the claim path.
contract BattleArena is Ownable2Step, ReentrancyGuard, Pausable, EIP712 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice A tradeable market: the reward token and the Pyth feed that modulates rewards.
    struct Market {
        SyntheticStock token;
        bytes32 feedId;
        bool active;
    }

    /// @notice The voucher signed by the game server (EIP-712).
    /// @param winner Recipient of the reward (must be non-zero).
    /// @param loser Opponent, counted in `losses`; address(0) for no loser (e.g. PvE).
    /// @param roomId Unique battle room id; single-use replay key.
    /// @param ticker bytes32 ASCII symbol left-aligned, e.g. bytes32("TSLA").
    /// @param baseAmount Base reward in token base units, before the on-chain buff.
    /// @param captureSpeciesId BrokerMon species to mint for the winner; 0 for none.
    /// @param captureLevel BrokerMon level (ignored when no capture).
    /// @param deadline Last unix timestamp (inclusive) at which the voucher is valid.
    struct Claim {
        address winner;
        address loser;
        bytes32 roomId;
        bytes32 ticker;
        uint256 baseAmount;
        uint16 captureSpeciesId;
        uint8 captureLevel;
        uint64 deadline;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice EIP-712 type hash of `Claim`.
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address winner,address loser,bytes32 roomId,bytes32 ticker,uint256 baseAmount,uint16 captureSpeciesId,uint8 captureLevel,uint64 deadline)"
    );

    /// @notice Basis-points denominator.
    uint256 public constant BPS = 10_000;
    /// @notice Spot-vs-EMA deviation (bps) that must be strictly exceeded (either way) for a buff.
    int256 public constant DEVIATION_THRESHOLD_BPS = 200;
    /// @notice Magnitude of the bull/bear buff in bps (+1000 bull, -1000 bear).
    int16 public constant BUFF_BPS = 1000;
    /// @notice Default maximum accepted age of an oracle price (3 days: equity feeds idle over weekends).
    uint256 public constant DEFAULT_MAX_PRICE_AGE = 3 days;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    /// @notice Pyth pull-oracle contract.
    IPyth public pyth;
    /// @notice Address whose EIP-712 signature authorizes claims (the game server).
    address public voucherSigner;
    /// @notice Maximum age in seconds of the oracle price for a buff to apply.
    uint256 public maxPriceAge = DEFAULT_MAX_PRICE_AGE;
    /// @notice The BrokerMon NFT contract (this contract must be its minter).
    BrokerMonNFT public brokerMon;

    /// @notice Markets by ticker (bytes32 ASCII symbol, left-aligned).
    mapping(bytes32 ticker => Market) public markets;
    /// @notice True once a room's voucher has been redeemed (per-room replay protection).
    mapping(bytes32 roomId => bool) public claimed;
    /// @notice Battles won per player.
    mapping(address => uint32) public wins;
    /// @notice Battles lost per player.
    mapping(address => uint32) public losses;
    /// @notice Total tokens minted to a player across all markets (base units).
    mapping(address => uint256) public totalMinted;
    /// @notice Native-token refunds that could not be sent during `claim` and await `withdrawRefund`.
    mapping(address => uint256) public pendingRefund;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice A voucher was redeemed.
    /// @param roomId The battle room.
    /// @param winner The rewarded player.
    /// @param ticker The market ticker.
    /// @param minted Tokens minted (after buff).
    /// @param buffBps The applied buff in bps (+1000, 0, -1000).
    /// @param priceStale True if the oracle price was unavailable/stale/invalid (buff forced to 0).
    /// @param nftId BrokerMon token id minted, or 0 if none.
    event Claimed(
        bytes32 indexed roomId,
        address indexed winner,
        bytes32 indexed ticker,
        uint256 minted,
        int16 buffBps,
        bool priceStale,
        uint256 nftId
    );
    /// @notice A market was configured.
    event MarketSet(bytes32 indexed ticker, address token, bytes32 feedId, bool active);
    /// @notice The voucher signer changed.
    event VoucherSignerSet(address indexed signer);
    /// @notice The Pyth contract changed.
    event PythSet(address indexed pyth);
    /// @notice The BrokerMon contract changed.
    event BrokerMonSet(address indexed brokerMon);
    /// @notice The maximum price age changed.
    event MaxPriceAgeSet(uint256 maxPriceAge);
    /// @notice Leftover native tokens were refunded to `to` at the end of a claim.
    event Refunded(address indexed to, uint256 amount);
    /// @notice A refund could not be sent and was credited to `pendingRefund`.
    event RefundDeferred(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice A zero address / zero id / zero value was supplied where not allowed.
    error ZeroValue();
    /// @notice The room's voucher was already redeemed.
    error AlreadyClaimed(bytes32 roomId);
    /// @notice The voucher deadline has passed.
    error VoucherExpired(uint64 deadline);
    /// @notice The ticker has no active market.
    error MarketInactive(bytes32 ticker);
    /// @notice The signature is malformed or was not produced by `voucherSigner`.
    error InvalidSignature();
    /// @notice Winner and loser must differ.
    error SameWinnerLoser();
    /// @notice Native-token transfer failed.
    error TransferFailed();
    /// @notice Nothing to withdraw.
    error NothingToWithdraw();
    /// @notice `renounceOwnership` is disabled: it would freeze signer rotation and pausing.
    error RenounceDisabled();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param owner_ Initial owner (2-step transferable).
    /// @param pyth_ Pyth contract address. Only stored here, not called.
    /// @param voucherSigner_ Game-server signing address.
    /// @param brokerMon_ BrokerMon NFT contract.
    constructor(address owner_, address pyth_, address voucherSigner_, address brokerMon_)
        Ownable(owner_)
        EIP712("PokeStonks", "1")
    {
        if (pyth_ == address(0) || voucherSigner_ == address(0) || brokerMon_ == address(0)) {
            revert ZeroValue();
        }
        pyth = IPyth(pyth_);
        voucherSigner = voucherSigner_;
        brokerMon = BrokerMonNFT(brokerMon_);
        emit PythSet(pyth_);
        emit VoucherSignerSet(voucherSigner_);
        emit BrokerMonSet(brokerMon_);
        emit MaxPriceAgeSet(DEFAULT_MAX_PRICE_AGE);
    }

    // ---------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------

    /// @notice Redeems a server-signed voucher: mints the (buffed) reward to the winner and optionally a BrokerMon.
    /// @dev Anyone may submit. The caller may attach a Pyth update (`priceUpdate`) and pay its fee via
    ///      `msg.value`; the update is best-effort (a failing/absent update never reverts the claim) and any
    ///      unspent `msg.value` is refunded to the caller (or credited to `pendingRefund` if the refund
    ///      transfer fails). The room is marked claimed before any external call.
    /// @param c The voucher.
    /// @param sig 65-byte `r||s||v` ECDSA signature by `voucherSigner` over the EIP-712 digest of `c`
    ///        (low-s enforced; the EIP-2098 compact form is rejected).
    /// @param priceUpdate Optional Pyth update payloads (may be empty).
    function claim(Claim calldata c, bytes calldata sig, bytes[] calldata priceUpdate)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        if (claimed[c.roomId]) revert AlreadyClaimed(c.roomId);
        if (block.timestamp > c.deadline) revert VoucherExpired(c.deadline);
        if (c.winner == address(0)) revert ZeroValue();
        if (c.winner == c.loser) revert SameWinnerLoser();
        Market memory m = markets[c.ticker];
        if (!m.active) revert MarketInactive(c.ticker);
        _verify(c, sig);

        // Effects first: after this point a re-entrant or replayed claim for this room is impossible.
        claimed[c.roomId] = true;

        uint256 spent = priceUpdate.length == 0 ? 0 : _tryUpdatePrice(priceUpdate);

        (int16 buff, bool stale) = _buffBps(m.feedId);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 minted = c.baseAmount * uint256(int256(BPS) + int256(buff)) / BPS; // buff in [-1000, 1000] => factor > 0

        _recordResult(c.winner, c.loser, minted);

        m.token.mint(c.winner, minted);

        uint256 nftId =
            c.captureSpeciesId == 0 ? 0 : brokerMon.mint(c.winner, c.captureSpeciesId, c.captureLevel, c.roomId);

        emit Claimed(c.roomId, c.winner, c.ticker, minted, buff, stale, nftId);

        // Interaction last: refund unspent native tokens.
        if (msg.value > spent) _refund(msg.sender, msg.value - spent);
    }

    /// @notice Withdraws a native-token refund that could not be delivered during `claim`.
    function withdrawRefund() external nonReentrant {
        uint256 amount = pendingRefund[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingRefund[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(msg.sender, amount);
    }

    /// @notice EIP-712 digest a voucher signer must sign for `c` under this contract's domain.
    /// @param c The voucher.
    /// @return The digest to sign.
    function hashClaim(Claim calldata c) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(c));
    }

    /// @notice The EIP-712 domain separator of this contract.
    /// @return The domain separator.
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Shows the on-chain-verified buff a claim on `ticker` would receive right now.
    /// @dev Reads whatever Pyth currently stores (a pending Pyth update pushed inside `claim` is not
    ///      reflected). Never reverts: unknown tickers or oracle problems yield `(0, true)`.
    /// @param ticker bytes32 ASCII symbol left-aligned.
    /// @return buffBps +1000 (bull), -1000 (bear) or 0.
    /// @return stale True if the price was unavailable, stale, or invalid (buff forced to 0).
    function previewBuff(bytes32 ticker) external view returns (int16 buffBps, bool stale) {
        return _buffBps(markets[ticker].feedId);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Sets the game-server voucher signer.
    /// @param signer New signer (non-zero).
    function setVoucherSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroValue();
        voucherSigner = signer;
        emit VoucherSignerSet(signer);
    }

    /// @notice Configures (or deactivates) a market.
    /// @param ticker bytes32 ASCII symbol left-aligned, e.g. bytes32("TSLA").
    /// @param token The SyntheticStock token (this contract must be its minter).
    /// @param feedId Pyth price feed id (required non-zero when `active`).
    /// @param active Whether claims are accepted for this market.
    function setMarket(bytes32 ticker, address token, bytes32 feedId, bool active) external onlyOwner {
        if (ticker == bytes32(0) || token == address(0) || (active && feedId == bytes32(0))) revert ZeroValue();
        markets[ticker] = Market({token: SyntheticStock(token), feedId: feedId, active: active});
        emit MarketSet(ticker, token, feedId, active);
    }

    /// @notice Sets the Pyth contract.
    /// @param pyth_ New Pyth address (non-zero).
    function setPyth(address pyth_) external onlyOwner {
        if (pyth_ == address(0)) revert ZeroValue();
        pyth = IPyth(pyth_);
        emit PythSet(pyth_);
    }

    /// @notice Sets the BrokerMon NFT contract.
    /// @param brokerMon_ New NFT address (non-zero).
    function setBrokerMon(address brokerMon_) external onlyOwner {
        if (brokerMon_ == address(0)) revert ZeroValue();
        brokerMon = BrokerMonNFT(brokerMon_);
        emit BrokerMonSet(brokerMon_);
    }

    /// @notice Sets the maximum accepted oracle price age.
    /// @param seconds_ New maximum age in seconds (non-zero).
    function setMaxPriceAge(uint256 seconds_) external onlyOwner {
        if (seconds_ == 0) revert ZeroValue();
        maxPriceAge = seconds_;
        emit MaxPriceAgeSet(seconds_);
    }

    /// @notice Pauses claims.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes claims.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Disabled: renouncing would permanently freeze signer rotation and pausing.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev EIP-712 struct hash of a voucher.
    function _structHash(Claim calldata c) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
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
    }

    /// @dev Reverts unless `sig` is a valid signature by `voucherSigner` over `c`.
    function _verify(Claim calldata c, bytes calldata sig) internal view {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_structHash(c)), sig);
        if (err != ECDSA.RecoverError.NoError || recovered != voucherSigner) revert InvalidSignature();
    }

    /// @dev Updates per-player counters. Counters saturate rather than wrap/revert so a player's claims can
    ///      never be bricked by an overflow.
    function _recordResult(address winner, address loser, uint256 minted) internal {
        uint32 w = wins[winner];
        if (w != type(uint32).max) wins[winner] = w + 1;
        if (loser != address(0)) {
            uint32 l = losses[loser];
            if (l != type(uint32).max) losses[loser] = l + 1;
        }
        totalMinted[winner] += minted;
    }

    /// @dev Best-effort Pyth update using low-level calls so that a missing/reverting/misbehaving oracle can
    ///      never revert a claim. Returns the native value actually spent (0 if the update was skipped/failed).
    function _tryUpdatePrice(bytes[] calldata priceUpdate) internal returns (uint256 spent) {
        address p = address(pyth);
        (bool okFee, bytes memory feeRet) = p.staticcall(abi.encodeCall(IPyth.getUpdateFee, (priceUpdate)));
        if (!okFee || feeRet.length != 32) return 0;
        uint256 fee = abi.decode(feeRet, (uint256));
        if (fee > msg.value) return 0;
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool okUpdate,) = p.call{value: fee}(abi.encodeCall(IPyth.updatePriceFeeds, (priceUpdate)));
        return okUpdate ? fee : 0;
    }

    /// @dev Sends `amount` to `to`; on failure credits `pendingRefund` instead of reverting.
    function _refund(address to, uint256 amount) internal {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = to.call{value: amount}(""); // `to` is always the original msg.sender
        if (ok) {
            emit Refunded(to, amount);
        } else {
            pendingRefund[to] += amount;
            emit RefundDeferred(to, amount);
        }
    }

    /// @dev Reads spot and EMA from Pyth defensively and maps the deviation to a buff. Never reverts.
    ///      Any failure (call reverts, short/garbage return data, out-of-range fields, stale or non-positive
    ///      prices, mismatched exponents) yields `(0, true)`.
    function _buffBps(bytes32 feedId) internal view returns (int16 buff, bool stale) {
        (bool okSpot, int256 spot, int256 spotExpo, uint256 spotTime) =
            _readPrice(abi.encodeCall(IPyth.getPriceUnsafe, (feedId)));
        if (!okSpot) return (0, true);
        (bool okEma, int256 ema, int256 emaExpo, uint256 emaTime) =
            _readPrice(abi.encodeCall(IPyth.getEmaPriceUnsafe, (feedId)));
        if (!okEma) return (0, true);

        if (spot <= 0 || ema <= 0 || spotExpo != emaExpo) return (0, true);
        if (_isStale(spotTime) || _isStale(emaTime)) return (0, true);

        return (_buffFromPrices(spot, ema), false);
    }

    /// @dev Pure buff math. `spot` and `ema` must share an exponent and be positive and within int64 range so that
    ///      `(spot - ema) * BPS` cannot overflow int256.
    function _buffFromPrices(int256 spot, int256 ema) internal pure returns (int16) {
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 deviationBps = (spot - ema) * int256(BPS) / ema; // BPS = 10_000 fits int256
        if (deviationBps > DEVIATION_THRESHOLD_BPS) return BUFF_BPS;
        if (deviationBps < -DEVIATION_THRESHOLD_BPS) return -BUFF_BPS;
        return 0;
    }

    /// @dev True if `publishTime` is older than `maxPriceAge`. Times slightly in the future count as fresh.
    function _isStale(uint256 publishTime) internal view returns (bool) {
        return publishTime < block.timestamp && block.timestamp - publishTime > maxPriceAge;
    }

    /// @dev Staticcalls Pyth with `callData` and decodes a `PythStructs.Price` (4 static words) defensively.
    function _readPrice(bytes memory callData)
        internal
        view
        returns (bool ok, int256 price, int256 expo, uint256 publishTime)
    {
        (bool success, bytes memory ret) = address(pyth).staticcall(callData);
        if (!success || ret.length != 128) return (false, 0, 0, 0);
        int256 rawPrice;
        int256 rawExpo;
        (rawPrice,, rawExpo, publishTime) = abi.decode(ret, (int256, uint256, int256, uint256));
        // Pyth returns int64 price and int32 expo; anything outside those ranges is malformed.
        if (rawPrice < type(int64).min || rawPrice > type(int64).max) return (false, 0, 0, 0);
        if (rawExpo < type(int32).min || rawExpo > type(int32).max) return (false, 0, 0, 0);
        return (true, rawPrice, rawExpo, publishTime);
    }
}
