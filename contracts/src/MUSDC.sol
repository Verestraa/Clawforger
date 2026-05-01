// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MUSDC — Mock USDC for Clawforger on 0G Galileo testnet
/// @notice TESTNET ONLY. Permissionless mint. Do NOT deploy on mainnet.
/// @dev 6 decimals to match real USDC. Used as the x402 settlement asset
///      since real USDC does not exist on 0G testnet at hackathon time.
contract MUSDC is ERC20 {
    constructor() ERC20("Mock USDC (Clawforger)", "mUSDC") {}

    /// @notice Permissionless mint — anyone can mint to anyone. Testnet only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
