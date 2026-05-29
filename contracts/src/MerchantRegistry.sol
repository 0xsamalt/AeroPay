// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MerchantRegistry
 * @notice Registry of whitelisted merchants with fee rates and exposure caps
 */
contract MerchantRegistry is Ownable {
    struct MerchantConfig {
        bool enabled;
        address settlement;
        uint256 maxOutstanding;
        uint16 feeBps; // basis points (e.g., 100 = 1%)
        uint8 riskTier; // 1-5, where 1 is lowest risk
    }

    mapping(address => MerchantConfig) public merchants;
    address[] public merchantList;

    event MerchantRegistered(
        address indexed merchant, address settlement, uint256 maxOutstanding, uint16 feeBps, uint8 riskTier
    );

    event MerchantUpdated(address indexed merchant);
    event MerchantDisabled(address indexed merchant);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new merchant
     */
    function registerMerchant(
        address merchant,
        address settlement,
        uint256 maxOutstanding,
        uint16 feeBps,
        uint8 riskTier
    ) external onlyOwner {
        require(merchant != address(0), "Invalid merchant");
        require(settlement != address(0), "Invalid settlement");
        require(feeBps <= 1000, "Fee too high"); // Max 10%
        require(riskTier >= 1 && riskTier <= 5, "Invalid risk tier");
        require(!merchants[merchant].enabled, "Merchant already registered");

        merchants[merchant] = MerchantConfig({
            enabled: true,
            settlement: settlement,
            maxOutstanding: maxOutstanding,
            feeBps: feeBps,
            riskTier: riskTier
        });

        merchantList.push(merchant);

        emit MerchantRegistered(merchant, settlement, maxOutstanding, feeBps, riskTier);
    }

    /**
     * @notice Update merchant configuration
     */
    function updateMerchantConfig(
        address merchant,
        address settlement,
        uint256 maxOutstanding,
        uint16 feeBps,
        uint8 riskTier
    ) external onlyOwner {
        require(merchants[merchant].enabled, "Merchant not registered");
        require(settlement != address(0), "Invalid settlement");
        require(feeBps <= 1000, "Fee too high");
        require(riskTier >= 1 && riskTier <= 5, "Invalid risk tier");

        merchants[merchant].settlement = settlement;
        merchants[merchant].maxOutstanding = maxOutstanding;
        merchants[merchant].feeBps = feeBps;
        merchants[merchant].riskTier = riskTier;

        emit MerchantUpdated(merchant);
    }

    /**
     * @notice Disable a merchant
     */
    function disableMerchant(address merchant) external onlyOwner {
        require(merchants[merchant].enabled, "Merchant not enabled");
        merchants[merchant].enabled = false;
        emit MerchantDisabled(merchant);
    }

    /**
     * @notice Enable a previously disabled merchant
     */
    function enableMerchant(address merchant) external onlyOwner {
        require(!merchants[merchant].enabled, "Merchant already enabled");
        require(merchants[merchant].settlement != address(0), "Merchant not registered");
        merchants[merchant].enabled = true;
        emit MerchantUpdated(merchant);
    }

    /**
     * @notice Get merchant configuration
     */
    function getMerchantConfig(address merchant) external view returns (MerchantConfig memory) {
        return merchants[merchant];
    }

    /**
     * @notice Get all registered merchants
     */
    function getAllMerchants() external view returns (address[] memory) {
        return merchantList;
    }

    /**
     * @notice Check if merchant is enabled
     */
    function isMerchantEnabled(address merchant) external view returns (bool) {
        return merchants[merchant].enabled;
    }
}
