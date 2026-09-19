// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Fully scriptable Pyth stand-in used to exercise edge cases MockPyth cannot produce
///      (mismatched exponents, non-positive prices, future publish times, reverts, junk return data).
contract ConfigurablePyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    Price public spot;
    Price public ema;
    uint256 public fee;
    bool public revertPrices;
    bool public revertFee;
    bool public revertUpdate;
    uint256 public updates;
    /// @dev If non-empty, every price getter returns exactly these raw bytes instead of a Price.
    bytes public rawPriceReturn;
    /// @dev If non-empty, getUpdateFee returns exactly these raw bytes.
    bytes public rawFeeReturn;

    function set(Price memory spot_, Price memory ema_) external {
        spot = spot_;
        ema = ema_;
    }

    function setFlags(bool revertPrices_, bool revertFee_, bool revertUpdate_) external {
        revertPrices = revertPrices_;
        revertFee = revertFee_;
        revertUpdate = revertUpdate_;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function setRawPriceReturn(bytes calldata raw) external {
        rawPriceReturn = raw;
    }

    function setRawFeeReturn(bytes calldata raw) external {
        rawFeeReturn = raw;
    }

    function getPriceUnsafe(bytes32) external view returns (Price memory) {
        _maybeRaw();
        require(!revertPrices, "prices revert");
        return spot;
    }

    function getEmaPriceUnsafe(bytes32) external view returns (Price memory) {
        _maybeRaw();
        require(!revertPrices, "prices revert");
        return ema;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        bytes memory raw = rawFeeReturn;
        if (raw.length != 0) {
            assembly {
                return(add(raw, 0x20), mload(raw))
            }
        }
        require(!revertFee, "fee revert");
        return fee;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        require(!revertUpdate, "update revert");
        require(msg.value >= fee, "fee");
        ++updates;
    }

    function _maybeRaw() private view {
        bytes memory raw = rawPriceReturn;
        if (raw.length != 0) {
            assembly {
                return(add(raw, 0x20), mload(raw))
            }
        }
    }
}
