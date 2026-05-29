// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMerchantRegistry {
    struct MerchantConfig {
        bool enabled;
        address settlement;
        uint256 maxOutstanding;
        uint16 feeBps;
        uint8 riskTier;
    }

    function getMerchantConfig(address merchant) external view returns (MerchantConfig memory);
}

/**
 * @title FlashCreditVault
 * @notice Manages user deposits and flash credit authorizations for x402 payments
 * @dev Supports USDC on base sepolia with batch settlement and per-merchant exposure caps
 */
contract FlashCreditVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // EIP-712 Domain
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant FLASH_AUTH_TYPEHASH = keccak256(
        "FlashAuth(address user,address merchant,uint256 amount,address token,uint256 nonce,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    struct Session {
        uint256 limit;      // Spend limit in tokens (e.g., USDC has 6 decimals)
        uint256 spent;      // Total tokens spent using this session key
        uint256 expiry;     // Unix timestamp when session expires
        bool active;        // Session status
    }

    // User => SessionKey => Session details
    mapping(address => mapping(address => Session)) public sessions;

    event SessionAuthorized(address indexed user, address indexed sessionKey, uint256 limit, uint256 expiry);
    event SessionRevoked(address indexed user, address indexed sessionKey);

    // State variables
    IMerchantRegistry public merchantRegistry;
    address public treasury;

    // User balances
    mapping(address => mapping(address => uint256)) public totalDeposited; // user => token => amount
    mapping(address => mapping(address => uint256)) public reserved; // user => token => amount

    // Per-merchant tracking
    mapping(address => mapping(address => mapping(address => uint256))) public userToMerchantReserved; // user => merchant => token => amount
    mapping(address => mapping(address => uint256)) public merchantOutstanding; // merchant => token => amount

    // Nonces for replay protection
    mapping(address => uint256) public nonces;

    // Supported tokens
    mapping(address => bool) public supportedTokens;

    // Events
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event FlashAuthorized(
        address indexed user, address indexed merchant, address indexed token, uint256 amount, uint256 nonce
    );
    event FlashSettled(
        address indexed user, address indexed merchant, address indexed token, uint256 amount, uint256 fee
    );
    event TokenSupportUpdated(address indexed token, bool supported);
    event TreasuryUpdated(address indexed newTreasury);
    event MerchantRegistryUpdated(address indexed newRegistry);

    struct FlashAuth {
        address user;
        address merchant;
        uint256 amount;
        address token;
        uint256 nonce;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    constructor(address _merchantRegistry, address _treasury, address[] memory _supportedTokens) Ownable(msg.sender) {
        require(_merchantRegistry != address(0), "Invalid registry");
        require(_treasury != address(0), "Invalid treasury");

        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        treasury = _treasury;

        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            supportedTokens[_supportedTokens[i]] = true;
            emit TokenSupportUpdated(_supportedTokens[i], true);
        }

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("FlashCreditVault")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Deposit tokens to create flash credit lane
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited[msg.sender][token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw available (unreserved) tokens
     */
    function withdraw(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        uint256 available = availableBalance(msg.sender, token);
        require(available >= amount, "Insufficient available balance");

        totalDeposited[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    /**
     * @notice Authorize flash credit with signed approval
     */
    function authorizeFlash(FlashAuth calldata auth) external nonReentrant {
        // Validate signature and deadline
        require(block.timestamp <= auth.deadline, "Signature expired");
        require(auth.nonce == nonces[auth.user], "Invalid nonce");

        bytes32 structHash = keccak256(
            abi.encode(
                FLASH_AUTH_TYPEHASH, auth.user, auth.merchant, auth.amount, auth.token, auth.nonce, auth.deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        address signer = ecrecover(digest, auth.v, auth.r, auth.s);
        
        // If the signer is not the owner (auth.user), verify it is an authorized session key
        if (signer != auth.user) {
            Session storage session = sessions[auth.user][signer];
            require(session.active, "Session not active");
            require(block.timestamp < session.expiry, "Session expired");
            require(session.spent + auth.amount <= session.limit, "Session limit exceeded");

            // Track spent amount
            session.spent += auth.amount;
        } else {
            require(signer != address(0), "Invalid signature");
        }

        // Increment nonce
        nonces[auth.user]++;

        // Check user balance
        uint256 available = availableBalance(auth.user, auth.token);
        require(available >= auth.amount, "Insufficient balance");

        // Check merchant config
        IMerchantRegistry.MerchantConfig memory config = merchantRegistry.getMerchantConfig(auth.merchant);
        require(config.enabled, "Merchant not enabled");
        require(
            merchantOutstanding[auth.merchant][auth.token] + auth.amount <= config.maxOutstanding,
            "Merchant exposure exceeded"
        );

        // Reserve funds
        reserved[auth.user][auth.token] += auth.amount;
        userToMerchantReserved[auth.user][auth.merchant][auth.token] += auth.amount;
        merchantOutstanding[auth.merchant][auth.token] += auth.amount;

        emit FlashAuthorized(auth.user, auth.merchant, auth.token, auth.amount, auth.nonce);
    }

    /**
     * @notice Settle flash credit and transfer funds to merchant
     */
    function settleFlash(address user, address merchant, address token, uint256 amount) external nonReentrant {
        require(userToMerchantReserved[user][merchant][token] >= amount, "Insufficient reserved amount");

        IMerchantRegistry.MerchantConfig memory config = merchantRegistry.getMerchantConfig(merchant);
        require(config.enabled, "Merchant not enabled");

        // Calculate fee
        uint256 fee = (amount * config.feeBps) / 10000;
        uint256 netAmount = amount - fee;

        // Update state
        reserved[user][token] -= amount;
        userToMerchantReserved[user][merchant][token] -= amount;
        merchantOutstanding[merchant][token] -= amount;
        totalDeposited[user][token] -= amount;

        // Transfer funds
        if (netAmount > 0) {
            IERC20(token).safeTransfer(config.settlement, netAmount);
        }
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
        }

        emit FlashSettled(user, merchant, token, amount, fee);
    }

    /**
     * @notice Batch settle multiple flash credits
     */
    function settleFlashBatch(
        address[] calldata users,
        address[] calldata merchants,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external nonReentrant {
        require(
            users.length == merchants.length && users.length == tokens.length && users.length == amounts.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < users.length; i++) {
            if (userToMerchantReserved[users[i]][merchants[i]][tokens[i]] >= amounts[i]) {
                _settleFlashInternal(users[i], merchants[i], tokens[i], amounts[i]);
            }
        }
    }

    function _settleFlashInternal(address user, address merchant, address token, uint256 amount) internal {
        IMerchantRegistry.MerchantConfig memory config = merchantRegistry.getMerchantConfig(merchant);
        if (!config.enabled) return;

        uint256 fee = (amount * config.feeBps) / 10000;
        uint256 netAmount = amount - fee;

        reserved[user][token] -= amount;
        userToMerchantReserved[user][merchant][token] -= amount;
        merchantOutstanding[merchant][token] -= amount;
        totalDeposited[user][token] -= amount;

        if (netAmount > 0) {
            IERC20(token).safeTransfer(config.settlement, netAmount);
        }
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
        }

        emit FlashSettled(user, merchant, token, amount, fee);
    }

    /**
     * @notice Authorize a session key (hot wallet address) to sign transactions on your behalf
     */
    function authorizeSessionKey(address sessionKey, uint256 limit, uint256 expiry) external {
        require(sessionKey != address(0), "Invalid session key");
        require(expiry > block.timestamp, "Expiry must be in the future");
        require(limit > 0, "Limit must be > 0");

        sessions[msg.sender][sessionKey] = Session({
            limit: limit,
            spent: 0,
            expiry: expiry,
            active: true
        });

        emit SessionAuthorized(msg.sender, sessionKey, limit, expiry);
    }

    /**
     * @notice Revoke a session key's authority immediately
     */
    function revokeSessionKey(address sessionKey) external {
        sessions[msg.sender][sessionKey].active = false;
        emit SessionRevoked(msg.sender, sessionKey);
    }

    // View functions
    function availableBalance(address user, address token) public view returns (uint256) {
        return totalDeposited[user][token] - reserved[user][token];
    }

    function reservedForMerchant(address user, address merchant, address token) external view returns (uint256) {
        return userToMerchantReserved[user][merchant][token];
    }

    // Admin functions
    function updateTokenSupport(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function updateMerchantRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid registry");
        merchantRegistry = IMerchantRegistry(newRegistry);
        emit MerchantRegistryUpdated(newRegistry);
    }

    function getTotalDeposited(address user, address token) external view returns (uint256) {
        return totalDeposited[user][token];
    }

    function getReserved(address user, address token) external view returns (uint256) {
        return reserved[user][token];
    }
}
