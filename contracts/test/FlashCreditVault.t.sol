// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FlashCreditVault.sol";
import "../src/MerchantRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock vUSD", "mvUSD") {
        _mint(msg.sender, 1000000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FlashCreditVaultTest is Test {
    FlashCreditVault public vault;
    MerchantRegistry public registry;
    MockToken public token;

    address public owner = address(this);
    address public treasury = address(0x9999);
    address public user = address(0x1234);
    address public merchant = address(0x5678);
    address public merchantSettlement = address(0x5679);

    uint256 public userPrivateKey = 0xA11CE;

    function setUp() public {
        // Deploy contracts
        registry = new MerchantRegistry();

        token = new MockToken();

        address[] memory supportedTokens = new address[](1);
        supportedTokens[0] = address(token);

        vault = new FlashCreditVault(address(registry), treasury, supportedTokens);

        // Setup merchant
        registry.registerMerchant(
            merchant,
            merchantSettlement,
            1000 ether,
            100, // 1% fee
            2
        );

        // Give user some tokens
        user = vm.addr(userPrivateKey);
        token.mint(user, 3000 ether);
    }

    function testDeposit() public {
        vm.startPrank(user);

        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        assertEq(vault.totalDeposited(user, address(token)), depositAmount);
        assertEq(vault.availableBalance(user, address(token)), depositAmount);

        vm.stopPrank();
    }

    function testWithdraw() public {
        vm.startPrank(user);

        // Deposit first
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        // Withdraw
        uint256 withdrawAmount = 50 ether;
        vault.withdraw(address(token), withdrawAmount);

        assertEq(vault.totalDeposited(user, address(token)), depositAmount - withdrawAmount);
        assertEq(token.balanceOf(user), 3000 ether - depositAmount + withdrawAmount);

        vm.stopPrank();
    }

    function testAuthorizeFlash() public {
        vm.startPrank(user);

        // Deposit
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        vm.stopPrank();

        // Create flash auth
        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, userPrivateKey);

        // Authorize
        vault.authorizeFlash(auth);

        assertEq(vault.reserved(user, address(token)), flashAmount);
        assertEq(vault.availableBalance(user, address(token)), depositAmount - flashAmount);
        assertEq(vault.merchantOutstanding(merchant, address(token)), flashAmount);
    }

    function testSettleFlash() public {
        vm.startPrank(user);

        // Deposit
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        vm.stopPrank();

        // Authorize flash
        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, userPrivateKey);

        vault.authorizeFlash(auth);

        // Settle
        vault.settleFlash(user, merchant, address(token), flashAmount);

        // Check balances
        uint256 expectedFee = (flashAmount * 100) / 10000; // 1%
        uint256 expectedNet = flashAmount - expectedFee;

        assertEq(vault.reserved(user, address(token)), 0);
        assertEq(vault.merchantOutstanding(merchant, address(token)), 0);
        assertEq(token.balanceOf(merchantSettlement), expectedNet);
        assertEq(token.balanceOf(treasury), expectedFee);
    }

    function testCannotOverspend() public {
        vm.startPrank(user);

        // Deposit
        uint256 depositAmount = 10 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        vm.stopPrank();

        // Try to authorize more than deposited
        uint256 flashAmount = 20 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, userPrivateKey);

        vm.expectRevert("Insufficient balance");
        vault.authorizeFlash(auth);
    }

    function testMerchantExposureCap() public {
        vm.startPrank(user);

        // Deposit large amount
        uint256 depositAmount = 2000 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        vm.stopPrank();

        // Try to exceed merchant's maxOutstanding (1000 ether)
        uint256 flashAmount = 1500 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, userPrivateKey);

        vm.expectRevert("Merchant exposure exceeded");
        vault.authorizeFlash(auth);
    }

    function testExpiredSignature() public {
        vm.startPrank(user);

        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        vm.stopPrank();

        // Create expired signature
        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, userPrivateKey);

        vm.expectRevert("Signature expired");
        vault.authorizeFlash(auth);
    }

    uint256 public sessionPrivateKey = 0xB0B;
    address public sessionKey;

    function testSessionKeySuccess() public {
        sessionKey = vm.addr(sessionPrivateKey);
        
        vm.startPrank(user);
        // Deposit first
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        // Authorize session key
        uint256 limit = 50 ether;
        uint256 expiry = block.timestamp + 1 hours;
        vault.authorizeSessionKey(sessionKey, limit, expiry);
        vm.stopPrank();

        // Create flash auth signed by session key
        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, sessionPrivateKey);

        // Authorize flash using session key signature
        vault.authorizeFlash(auth);

        assertEq(vault.reserved(user, address(token)), flashAmount);
        
        // Check session spent amount
        (, uint256 spent, , ) = vault.sessions(user, sessionKey);
        assertEq(spent, flashAmount);
    }

    function testSessionKeyExpired() public {
        sessionKey = vm.addr(sessionPrivateKey);

        vm.startPrank(user);
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        // Authorize session key
        uint256 limit = 50 ether;
        uint256 expiry = block.timestamp + 1 hours;
        vault.authorizeSessionKey(sessionKey, limit, expiry);
        vm.stopPrank();

        // Warp time past expiry
        vm.warp(expiry + 1);

        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, sessionPrivateKey);

        vm.expectRevert("Session expired");
        vault.authorizeFlash(auth);
    }

    function testSessionKeyLimitExceeded() public {
        sessionKey = vm.addr(sessionPrivateKey);

        vm.startPrank(user);
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        // Authorize session key with 10 ether limit
        uint256 limit = 10 ether;
        uint256 expiry = block.timestamp + 1 hours;
        vault.authorizeSessionKey(sessionKey, limit, expiry);
        vm.stopPrank();

        // Try to authorize 15 ether flash amount
        uint256 flashAmount = 15 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, sessionPrivateKey);

        vm.expectRevert("Session limit exceeded");
        vault.authorizeFlash(auth);
    }

    function testSessionKeyRevoked() public {
        sessionKey = vm.addr(sessionPrivateKey);

        vm.startPrank(user);
        uint256 depositAmount = 100 ether;
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount);

        // Authorize session key
        uint256 limit = 50 ether;
        uint256 expiry = block.timestamp + 1 hours;
        vault.authorizeSessionKey(sessionKey, limit, expiry);

        // Revoke session key immediately
        vault.revokeSessionKey(sessionKey);
        vm.stopPrank();

        uint256 flashAmount = 10 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = vault.nonces(user);

        FlashCreditVault.FlashAuth memory auth =
            _signFlashAuth(user, merchant, flashAmount, address(token), nonce, deadline, sessionPrivateKey);

        vm.expectRevert("Session not active");
        vault.authorizeFlash(auth);
    }

    // Helper function to create signed flash auth
    function _signFlashAuth(
        address _user,
        address _merchant,
        uint256 _amount,
        address _token,
        uint256 _nonce,
        uint256 _deadline,
        uint256 _privateKey
    ) internal view returns (FlashCreditVault.FlashAuth memory) {
        bytes32 structHash =
            keccak256(abi.encode(vault.FLASH_AUTH_TYPEHASH(), _user, _merchant, _amount, _token, _nonce, _deadline));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);

        return FlashCreditVault.FlashAuth({
            user: _user,
            merchant: _merchant,
            amount: _amount,
            token: _token,
            nonce: _nonce,
            deadline: _deadline,
            v: v,
            r: r,
            s: s
        });
    }
}
