// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice A simple mintable ERC20 token with 6 decimals to simulate USDC
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("Mock USD Coin", "mUSDC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Mint new tokens (testing only)
     * @param to The recipient of minted tokens
     * @param amount Amount in 6-decimals
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
