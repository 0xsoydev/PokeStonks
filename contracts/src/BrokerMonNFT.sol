// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title BrokerMonNFT
/// @notice Collectible "BrokerMon" creature cards captured by winning PokeStonks battles.
/// @dev SYNTHETIC, TESTNET-ONLY COLLECTIBLE. It is NOT a security and represents no real-world
///      asset or claim. Metadata and artwork are generated fully on-chain (base64 JSON + SVG).
///
///      Design notes:
///      - Token ids are sequential starting at 1. The counter is only touched when a capture is
///        minted (a subset of all battle claims), never on the plain reward path.
///      - `_mint` (not `_safeMint`) is used so a hostile receiver contract can never revert or
///        re-enter a battle claim.
///      - Species text is validated at construction so it can never break the JSON/SVG output.
contract BrokerMonNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    /// @notice Static description of a species (one per market).
    struct Species {
        string symbol;
        string name;
        uint8 affinity;
        bool exists;
    }

    /// @notice Per-token data recorded at mint time.
    struct BrokerData {
        uint16 speciesId;
        uint8 level;
        uint64 mintedAt;
        bytes32 roomId;
    }

    /// @notice Number of affinities (0 Normal, 1 Electric, 2 Grass, 3 Fire, 4 Water, 5 Psychic).
    uint8 public constant AFFINITY_COUNT = 6;

    /// @notice The only address allowed to mint. Zero until set; immutable once set.
    address public minter;

    /// @notice Highest token id minted so far (0 = none).
    uint256 public lastTokenId;

    mapping(uint16 speciesId => Species) private _species;
    mapping(uint256 tokenId => BrokerData) private _data;

    /// @notice Emitted once when the minter is assigned.
    /// @param minter The address that may now mint.
    event MinterSet(address indexed minter);
    /// @notice Emitted for every BrokerMon minted, carrying the metadata indexers need.
    /// @param tokenId The new token id.
    /// @param to The owner.
    /// @param speciesId Species (market) id.
    /// @param level Level at capture.
    /// @param roomId Battle room that produced the capture.
    event BrokerMonMinted(
        uint256 indexed tokenId, address indexed to, uint16 indexed speciesId, uint8 level, bytes32 roomId
    );

    /// @notice Thrown when a zero address is supplied where a real address is required.
    error ZeroAddress();
    /// @notice Thrown when `setMinter` is called after the minter was already assigned.
    error MinterAlreadySet();
    /// @notice Thrown when a caller other than the minter tries to mint.
    /// @param caller The unauthorized caller.
    error NotMinter(address caller);
    /// @notice Thrown when minting a species id that is not in the species table.
    /// @param speciesId The unknown species id.
    error UnknownSpecies(uint16 speciesId);
    /// @notice Thrown when the constructor species arrays are inconsistent or invalid.
    error InvalidSpeciesTable();

    /// @param owner_ Account allowed to call `setMinter` (once).
    /// @param ids Species ids (non-zero, unique).
    /// @param symbols Ticker symbols, index-aligned with `ids`.
    /// @param names Human names, index-aligned with `ids`.
    /// @param affinities Affinity per species (0..5), index-aligned with `ids`.
    constructor(
        address owner_,
        uint16[] memory ids,
        string[] memory symbols,
        string[] memory names,
        uint8[] memory affinities
    ) ERC721("BrokerMon", "BROKER") Ownable(owner_) {
        uint256 n = ids.length;
        if (n == 0 || symbols.length != n || names.length != n || affinities.length != n) {
            revert InvalidSpeciesTable();
        }
        for (uint256 i = 0; i < n; ++i) {
            uint16 id = ids[i];
            if (id == 0 || _species[id].exists || affinities[i] >= AFFINITY_COUNT) revert InvalidSpeciesTable();
            _requireSafeText(symbols[i]);
            _requireSafeText(names[i]);
            _species[id] = Species({symbol: symbols[i], name: names[i], affinity: affinities[i], exists: true});
        }
    }

    /// @notice Assigns the sole minter. Callable by the owner exactly once; the assignment is permanent.
    /// @param minter_ The BattleArena contract.
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        if (minter != address(0)) revert MinterAlreadySet();
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Mints a BrokerMon. Only callable by the minter.
    /// @param to Recipient (must be non-zero).
    /// @param speciesId Species (market) id; must exist in the species table.
    /// @param level Level at capture.
    /// @param roomId Battle room that produced the capture (recorded in metadata).
    /// @return tokenId The id of the new token.
    function mint(address to, uint16 speciesId, uint8 level, bytes32 roomId) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        if (!_species[speciesId].exists) revert UnknownSpecies(speciesId);
        tokenId = ++lastTokenId;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 mintedAt = uint64(block.timestamp);
        _data[tokenId] = BrokerData({speciesId: speciesId, level: level, mintedAt: mintedAt, roomId: roomId});
        // forge-lint: disable-next-line(unsafe-oz-erc721-mint)
        _mint(to, tokenId);
        emit BrokerMonMinted(tokenId, to, speciesId, level, roomId);
    }

    /// @notice Returns the species record for `speciesId` (reverts if unknown).
    /// @param speciesId Species id.
    /// @return The species struct.
    function speciesInfo(uint16 speciesId) external view returns (Species memory) {
        Species memory s = _species[speciesId];
        if (!s.exists) revert UnknownSpecies(speciesId);
        return s;
    }

    /// @notice Returns the mint-time data for `tokenId` (reverts if it does not exist).
    /// @param tokenId Token id.
    /// @return The stored data.
    function brokerData(uint256 tokenId) external view returns (BrokerData memory) {
        _requireOwned(tokenId);
        return _data[tokenId];
    }

    /// @notice Human-readable name of an affinity id.
    /// @param affinity 0..5.
    /// @return The affinity name, e.g. "Electric".
    function affinityName(uint8 affinity) public pure returns (string memory) {
        if (affinity == 0) return "Normal";
        if (affinity == 1) return "Electric";
        if (affinity == 2) return "Grass";
        if (affinity == 3) return "Fire";
        if (affinity == 4) return "Water";
        if (affinity == 5) return "Psychic";
        revert InvalidSpeciesTable();
    }

    /// @notice Card background colour (hex, with leading #) for an affinity id.
    /// @param affinity 0..5.
    /// @return The colour string.
    function affinityColor(uint8 affinity) public pure returns (string memory) {
        if (affinity == 0) return "#A8A878";
        if (affinity == 1) return "#F8D030";
        if (affinity == 2) return "#78C850";
        if (affinity == 3) return "#F08030";
        if (affinity == 4) return "#6890F0";
        if (affinity == 5) return "#F85888";
        revert InvalidSpeciesTable();
    }

    /// @notice Fully on-chain metadata: `data:application/json;base64,...` with an on-chain SVG image.
    /// @param tokenId Token id (must exist).
    /// @return The data URI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        BrokerData memory d = _data[tokenId];
        Species memory s = _species[d.speciesId];
        string memory typeName = affinityName(s.affinity);

        string memory title = string.concat(s.symbol, " BrokerMon #", tokenId.toString());
        string memory json = string.concat(
            '{"name":"',
            title,
            '","description":"A synthetic BrokerMon from PokeStonks (',
            s.name,
            "). Testnet game collectible only: not a security and not a real asset.",
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(title, s.symbol, typeName, s.affinity, d.level))),
            '","attributes":',
            _attributes(d, s, typeName),
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Builds the attributes JSON array.
    function _attributes(BrokerData memory d, Species memory s, string memory typeName)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            '[{"trait_type":"Ticker","value":"',
            s.symbol,
            '"},{"trait_type":"Species","value":"',
            s.name,
            '"},{"trait_type":"Type","value":"',
            typeName,
            '"},{"trait_type":"Level","display_type":"number","value":',
            uint256(d.level).toString(),
            '},{"trait_type":"Room","value":"',
            uint256(d.roomId).toHexString(32),
            '"}]'
        );
    }

    /// @dev Builds the compact SVG card. All interpolated text is validated/numeric, so it cannot inject markup.
    function _svg(string memory title, string memory symbol, string memory typeName, uint8 affinity, uint8 level)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300' font-family='monospace' fill='#111'>",
            "<rect width='300' height='300' rx='24' fill='",
            affinityColor(affinity),
            "'/><rect x='12' y='12' width='276' height='276' rx='16' fill='none' stroke='#000' stroke-opacity='.25' stroke-width='4'/>",
            "<text x='150' y='168' font-size='72' font-weight='bold' text-anchor='middle'>",
            symbol,
            "</text><text x='28' y='48' font-size='20'>",
            typeName,
            "</text><text x='272' y='48' font-size='20' text-anchor='end'>Lv ",
            uint256(level).toString(),
            "</text><text x='150' y='268' font-size='16' text-anchor='middle'>",
            title,
            "</text></svg>"
        );
    }

    /// @dev Rejects empty text and any character that could break JSON/SVG output or is non-printable ASCII.
    function _requireSafeText(string memory text) private pure {
        bytes memory b = bytes(text);
        if (b.length == 0) revert InvalidSpeciesTable();
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            // printable ASCII only, excluding " & ' < > \
            if (c < 0x20 || c > 0x7E || c == 0x22 || c == 0x26 || c == 0x27 || c == 0x3C || c == 0x3E || c == 0x5C) {
                revert InvalidSpeciesTable();
            }
        }
    }

    // ---- required ERC721Enumerable overrides (OpenZeppelin v5) ----

    /// @inheritdoc ERC721Enumerable
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    /// @inheritdoc ERC721Enumerable
    function _increaseBalance(address account, uint128 value) internal override(ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /// @inheritdoc ERC721Enumerable
    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
