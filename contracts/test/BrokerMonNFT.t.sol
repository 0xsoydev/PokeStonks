// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {BrokerMonNFT} from "../src/BrokerMonNFT.sol";

contract BrokerMonNFTTest is Test {
    BrokerMonNFT internal nft;
    address internal owner = makeAddr("owner");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";

    event MinterSet(address indexed minter);
    event BrokerMonMinted(
        uint256 indexed tokenId, address indexed to, uint16 indexed speciesId, uint8 level, bytes32 roomId
    );

    function setUp() public {
        (uint16[] memory ids, string[] memory sy, string[] memory na, uint8[] memory af) = _table();
        nft = new BrokerMonNFT(owner, ids, sy, na, af);
        vm.prank(owner);
        nft.setMinter(minter);
    }

    // ---- helpers ----

    /// @dev One species per affinity 0..5.
    function _table()
        internal
        pure
        returns (uint16[] memory ids, string[] memory sy, string[] memory na, uint8[] memory af)
    {
        ids = new uint16[](6);
        sy = new string[](6);
        na = new string[](6);
        af = new uint8[](6);
        string[6] memory symbols = ["AAPL", "TSLA", "XOM", "GME", "AMZN", "COIN"];
        string[6] memory names = ["Apple", "Tesla", "Exxon", "GameStop", "Amazon", "Coinbase"];
        for (uint256 i = 0; i < 6; ++i) {
            ids[i] = uint16(i + 1);
            sy[i] = symbols[i];
            na[i] = names[i];
            af[i] = uint8(i);
        }
    }

    function _mint(address to, uint16 species, uint8 level, bytes32 room) internal returns (uint256) {
        vm.prank(minter);
        return nft.mint(to, species, level, room);
    }

    function _decodeUri(uint256 id) internal view returns (string memory json) {
        string memory uri = nft.tokenURI(id);
        assertTrue(_startsWith(uri, JSON_PREFIX), "json data uri prefix");
        json = string(_b64decode(_slice(bytes(uri), bytes(JSON_PREFIX).length)));
    }

    function _decodeSvg(uint256 id) internal view returns (string memory svg) {
        string memory image = vm.parseJsonString(_decodeUri(id), ".image");
        assertTrue(_startsWith(image, SVG_PREFIX), "svg data uri prefix");
        svg = string(_b64decode(_slice(bytes(image), bytes(SVG_PREFIX).length)));
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory p = bytes(prefix);
        if (a.length < p.length) return false;
        for (uint256 i = 0; i < p.length; ++i) {
            if (a[i] != p[i]) return false;
        }
        return true;
    }

    function _contains(string memory hay, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(hay);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i + n.length <= h.length; ++i) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    function _slice(bytes memory b, uint256 from) internal pure returns (bytes memory out) {
        out = new bytes(b.length - from);
        for (uint256 i = 0; i < out.length; ++i) {
            out[i] = b[from + i];
        }
    }

    /// @dev Strict standard-alphabet base64 decoder (padding required), used to verify on-chain encoding.
    function _b64decode(bytes memory data) internal pure returns (bytes memory) {
        require(data.length % 4 == 0, "b64 length");
        if (data.length == 0) return "";
        uint256 pad = 0;
        if (data[data.length - 1] == "=") pad++;
        if (data[data.length - 2] == "=") pad++;
        bytes memory out = new bytes((data.length / 4) * 3 - pad);
        uint256 o = 0;
        for (uint256 i = 0; i < data.length; i += 4) {
            uint256 n = (_v(data[i]) << 18) | (_v(data[i + 1]) << 12) | (_v(data[i + 2]) << 6) | _v(data[i + 3]);
            if (o < out.length) out[o++] = bytes1(uint8(n >> 16));
            if (o < out.length) out[o++] = bytes1(uint8(n >> 8));
            if (o < out.length) out[o++] = bytes1(uint8(n));
        }
        return out;
    }

    function _v(bytes1 c) internal pure returns (uint256) {
        if (c >= "A" && c <= "Z") return uint8(c) - 65;
        if (c >= "a" && c <= "z") return uint8(c) - 97 + 26;
        if (c >= "0" && c <= "9") return uint8(c) - 48 + 52;
        if (c == "+") return 62;
        if (c == "/") return 63;
        if (c == "=") return 0;
        revert("bad b64 char");
    }

    // ---- minting ----

    function test_mint_storesDataAndEmits() public {
        vm.warp(1_800_000_123);
        vm.expectEmit(true, true, true, true, address(nft));
        emit BrokerMonMinted(1, alice, 2, 9, bytes32("room"));
        uint256 id = _mint(alice, 2, 9, bytes32("room"));
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.lastTokenId(), 1);
        BrokerMonNFT.BrokerData memory d = nft.brokerData(1);
        assertEq(d.speciesId, 2);
        assertEq(d.level, 9);
        assertEq(d.roomId, bytes32("room"));
        assertEq(d.mintedAt, 1_800_000_123);
    }

    function test_mint_sequentialIds_andEnumeration() public {
        _mint(alice, 1, 1, bytes32("a"));
        _mint(bob, 2, 1, bytes32("b"));
        _mint(alice, 3, 1, bytes32("c"));
        assertEq(nft.totalSupply(), 3);
        assertEq(nft.balanceOf(alice), 2);
        assertEq(nft.tokenOfOwnerByIndex(alice, 0), 1);
        assertEq(nft.tokenOfOwnerByIndex(alice, 1), 3);
        assertEq(nft.tokenByIndex(1), 2);
    }

    function test_mint_onlyMinter() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.NotMinter.selector, owner));
        nft.mint(alice, 1, 1, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.NotMinter.selector, alice));
        nft.mint(alice, 1, 1, bytes32(0));
    }

    function test_mint_unknownSpecies_reverts() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.UnknownSpecies.selector, uint16(0)));
        nft.mint(alice, 0, 1, bytes32(0));
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.UnknownSpecies.selector, uint16(7)));
        nft.mint(alice, 7, 1, bytes32(0));
    }

    function test_mint_toZero_reverts() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(0)));
        nft.mint(address(0), 1, 1, bytes32(0));
    }

    function test_mint_toNonReceiverContract_doesNotRevert() public {
        // _mint (not _safeMint): a contract recipient can never block a battle claim.
        uint256 id = _mint(address(this), 1, 1, bytes32("x"));
        assertEq(nft.ownerOf(id), address(this));
    }

    function test_setMinter_onlyOwner_once_nonZero() public {
        BrokerMonNFT fresh = _fresh();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        fresh.setMinter(minter);

        vm.prank(owner);
        vm.expectRevert(BrokerMonNFT.ZeroAddress.selector);
        fresh.setMinter(address(0));

        vm.expectEmit(true, false, false, false, address(fresh));
        emit MinterSet(minter);
        vm.prank(owner);
        fresh.setMinter(minter);
        assertEq(fresh.minter(), minter);

        vm.prank(owner);
        vm.expectRevert(BrokerMonNFT.MinterAlreadySet.selector);
        fresh.setMinter(alice);
    }

    function test_mint_beforeMinterSet_reverts() public {
        BrokerMonNFT fresh = _fresh();
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.NotMinter.selector, address(this)));
        fresh.mint(alice, 1, 1, bytes32(0));
    }

    function _fresh() internal returns (BrokerMonNFT) {
        (uint16[] memory ids, string[] memory sy, string[] memory na, uint8[] memory af) = _table();
        return new BrokerMonNFT(owner, ids, sy, na, af);
    }

    // ---- tokenURI ----

    function test_tokenURI_isOnChainDataUri_withTicker() public {
        uint256 id = _mint(alice, 2, 12, bytes32(uint256(0xabc123)));
        string memory uri = nft.tokenURI(id);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));

        string memory json = _decodeUri(id);
        assertTrue(_contains(json, "TSLA"));
        assertEq(vm.parseJsonString(json, ".name"), "TSLA BrokerMon #1");
        assertTrue(_contains(vm.parseJsonString(json, ".description"), "not a security"));
        assertEq(vm.parseJsonString(json, ".attributes[0].trait_type"), "Ticker");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), "TSLA");
        assertEq(vm.parseJsonString(json, ".attributes[1].value"), "Tesla");
        assertEq(vm.parseJsonString(json, ".attributes[2].trait_type"), "Type");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Electric");
        assertEq(vm.parseJsonUint(json, ".attributes[3].value"), 12);
        assertEq(vm.parseJsonString(json, ".attributes[4].trait_type"), "Room");
        assertEq(
            vm.parseJsonString(json, ".attributes[4].value"),
            "0x0000000000000000000000000000000000000000000000000000000000abc123"
        );
    }

    function test_tokenURI_svgIsCompactAndTinted() public {
        uint256 id = _mint(alice, 2, 12, bytes32("r"));
        string memory svg = _decodeSvg(id);
        assertTrue(_startsWith(svg, "<svg xmlns='http://www.w3.org/2000/svg'"));
        assertTrue(_contains(svg, ">TSLA</text>"));
        assertTrue(_contains(svg, "#F8D030"), "electric tint");
        assertTrue(_contains(svg, ">Electric</text>"));
        assertTrue(_contains(svg, "Lv 12"));
        assertTrue(_contains(svg, "TSLA BrokerMon #1"));
        assertTrue(_contains(svg, "</svg>"));
        assertLt(bytes(svg).length, 1200, "svg stays compact");
    }

    function test_tokenURI_allAffinities() public {
        string[6] memory types = ["Normal", "Electric", "Grass", "Fire", "Water", "Psychic"];
        string[6] memory colors = ["#A8A878", "#F8D030", "#78C850", "#F08030", "#6890F0", "#F85888"];
        string[6] memory symbols = ["AAPL", "TSLA", "XOM", "GME", "AMZN", "COIN"];
        for (uint16 i = 0; i < 6; ++i) {
            uint256 id = _mint(alice, i + 1, 1, bytes32(uint256(i)));
            string memory json = _decodeUri(id);
            assertEq(vm.parseJsonString(json, ".attributes[2].value"), types[i]);
            assertEq(vm.parseJsonString(json, ".attributes[0].value"), symbols[i]);
            string memory svg = _decodeSvg(id);
            assertTrue(_contains(svg, colors[i]));
            assertEq(nft.affinityName(uint8(i)), types[i]);
            assertEq(nft.affinityColor(uint8(i)), colors[i]);
        }
    }

    function test_tokenURI_nonexistent_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(5)));
        nft.tokenURI(5);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(5)));
        nft.brokerData(5);
    }

    function test_tokenURI_levelBoundaries() public {
        uint256 id = _mint(alice, 1, 255, bytes32(0));
        assertEq(vm.parseJsonUint(_decodeUri(id), ".attributes[3].value"), 255);
        assertTrue(_contains(_decodeSvg(id), "Lv 255"));
        id = _mint(alice, 1, 0, bytes32(0));
        assertEq(vm.parseJsonUint(_decodeUri(id), ".attributes[3].value"), 0);
    }

    // ---- views / interfaces ----

    function test_speciesInfo() public view {
        BrokerMonNFT.Species memory s = nft.speciesInfo(2);
        assertEq(s.symbol, "TSLA");
        assertEq(s.name, "Tesla");
        assertEq(s.affinity, 1);
        assertTrue(s.exists);
    }

    function test_speciesInfo_unknown_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(BrokerMonNFT.UnknownSpecies.selector, uint16(42)));
        nft.speciesInfo(42);
    }

    function test_affinityHelpers_invalid_revert() public {
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        nft.affinityName(6);
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        nft.affinityColor(6);
    }

    function test_interfaces() public view {
        assertTrue(nft.supportsInterface(type(IERC721).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC721Enumerable).interfaceId));
        assertEq(nft.name(), "BrokerMon");
        assertEq(nft.symbol(), "BROKER");
    }

    function test_transfer_updatesEnumeration() public {
        uint256 id = _mint(alice, 1, 1, bytes32(0));
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.balanceOf(alice), 0);
        assertEq(nft.tokenOfOwnerByIndex(bob, 0), id);
    }

    // ---- constructor validation ----

    function test_constructor_rejectsBadTables() public {
        (uint16[] memory ids, string[] memory sy, string[] memory na, uint8[] memory af) = _table();

        // length mismatches
        uint16[] memory shortIds = new uint16[](5);
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, shortIds, sy, na, af);

        // empty table
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, new uint16[](0), new string[](0), new string[](0), new uint8[](0));

        // zero id
        ids[0] = 0;
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, ids, sy, na, af);
        ids[0] = 1;

        // duplicate id
        ids[1] = 1;
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, ids, sy, na, af);
        ids[1] = 2;

        // bad affinity
        af[0] = 6;
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, ids, sy, na, af);
        af[0] = 0;
    }

    function test_constructor_rejectsUnsafeText() public {
        (uint16[] memory ids, string[] memory sy, string[] memory na, uint8[] memory af) = _table();
        string[8] memory bad = ['A"B', "A\\B", "A<B", "A>B", "A&B", "A'B", "", "A\nB"];
        for (uint256 i = 0; i < bad.length; ++i) {
            string memory saved = sy[0];
            sy[0] = bad[i];
            vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
            new BrokerMonNFT(owner, ids, sy, na, af);
            sy[0] = saved;

            saved = na[0];
            na[0] = bad[i];
            vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
            new BrokerMonNFT(owner, ids, sy, na, af);
            na[0] = saved;
        }
        // non-ASCII rejected
        sy[0] = unicode"Ä";
        vm.expectRevert(BrokerMonNFT.InvalidSpeciesTable.selector);
        new BrokerMonNFT(owner, ids, sy, na, af);
    }
}
