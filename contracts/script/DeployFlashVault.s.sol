// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashCreditVault.sol";
import "../src/MerchantRegistry.sol";
import "../src/MockUSDC.sol";

contract DeployFlashVault is Script {
    address[] public supportedTokens = new address[](1);

    function run() external {
        // -------------------------------
        // CONFIGURE THESE BEFORE DEPLOY
        // -------------------------------
        address treasury = 0xaBBAb4F74b85749b51599D65C2B8468B47870f53;
        uint256 deployerPrivateKey = uint256(vm.envBytes32("PRIVATE_KEY"));

        vm.startBroadcast(deployerPrivateKey);
        supportedTokens[0] = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; //USDC on base sepolia

        // ------------------------------------
        // 2. Deploy MerchantRegistry
        // ------------------------------------
        MerchantRegistry registry = new MerchantRegistry();

        // ------------------------------------
        // 3. Deploy FlashCreditVault
        // ------------------------------------
        FlashCreditVault vault = new FlashCreditVault(address(registry), treasury, supportedTokens);

        vm.stopBroadcast();

        // ------------------------------------
        // LOG ADDRESSES
        // ------------------------------------
        console2.log("MerchantRegistry deployed at:", address(registry));
        console2.log("FlashCreditVault deployed at:", address(vault));
        console2.log("Allowed token address:", address(supportedTokens[0]));
    }
}
