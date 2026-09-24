CREATE TABLE `activation_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activationId` int NOT NULL,
	`fromState` varchar(30),
	`toState` varchar(30) NOT NULL,
	`eventId` varchar(80) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activation_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `activation_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `activations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`serviceId` int NOT NULL,
	`supplierId` int NOT NULL,
	`activationId` varchar(80) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`supplierActivationId` varchar(120),
	`phoneMasked` varchar(40),
	`otpCode` varchar(20),
	`amountMinor` int NOT NULL,
	`state` enum('CREATED','RESERVED','PENDING','OTP_RECEIVED','SUCCESS','CANCELLED','TIMEOUT','REFUND') NOT NULL DEFAULT 'CREATED',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`expiresAt` timestamp,
	CONSTRAINT `activations_id` PRIMARY KEY(`id`),
	CONSTRAINT `activations_activationId_unique` UNIQUE(`activationId`),
	CONSTRAINT `activations_user_idem_idx` UNIQUE(`userId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`keyPrefix` varchar(20) NOT NULL,
	`secretHash` varchar(255) NOT NULL,
	`status` enum('active','inactive','revoked') NOT NULL DEFAULT 'active',
	`rateLimitPerMinute` int NOT NULL DEFAULT 60,
	`ipWhitelist` text,
	`lastUsedAt` timestamp,
	`requestCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reference` varchar(80) NOT NULL,
	`amountMinor` int NOT NULL,
	`bonusMinor` int NOT NULL DEFAULT 0,
	`status` enum('pending','paid','expired','failed') NOT NULL DEFAULT 'pending',
	`provider` varchar(40) NOT NULL DEFAULT 'qris',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `deposits_id` PRIMARY KEY(`id`),
	CONSTRAINT `deposits_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`activationId` int NOT NULL,
	`reference` varchar(80) NOT NULL,
	`amountMinor` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `refunds_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`code` varchar(60) NOT NULL,
	`name` varchar(100) NOT NULL,
	`countryCode` varchar(8) NOT NULL,
	`countryName` varchar(80) NOT NULL,
	`operator` varchar(60),
	`supplierPriceMinor` int NOT NULL,
	`salePriceMinor` int NOT NULL,
	`resellerPriceMinor` int NOT NULL,
	`vipPriceMinor` int NOT NULL,
	`apiPriceMinor` int NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`availability` enum('available','limited','offline') NOT NULL DEFAULT 'available',
	`successRateBps` int NOT NULL DEFAULT 9800,
	`responseTimeMs` int NOT NULL DEFAULT 1200,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`),
	CONSTRAINT `services_supplier_code_country_idx` UNIQUE(`supplierId`,`code`,`countryCode`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`apiUrl` varchar(255),
	`apiKeyEncrypted` text,
	`priority` int NOT NULL DEFAULT 100,
	`timeoutMs` int NOT NULL DEFAULT 10000,
	`status` enum('active','inactive','degraded') NOT NULL DEFAULT 'active',
	`successRateBps` int NOT NULL DEFAULT 9900,
	`avgResponseMs` int NOT NULL DEFAULT 800,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`userId` int NOT NULL,
	`reference` varchar(80) NOT NULL,
	`idempotencyKey` varchar(128),
	`type` enum('deposit','debit','refund','adjustment') NOT NULL,
	`direction` enum('credit','debit') NOT NULL,
	`amountMinor` int NOT NULL,
	`balanceAfterMinor` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_transactions_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `wallet_tx_idem_idx` UNIQUE(`userId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'IDR',
	`balanceMinor` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`eventId` varchar(80) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`payload` text NOT NULL,
	`status` enum('pending','delivered','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`responseCode` int,
	`lastError` text,
	`nextRetryAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_deliveries_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` varchar(500) NOT NULL,
	`secretHash` varchar(255) NOT NULL,
	`events` text NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`lastDeliveryAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_endpoints_id` PRIMARY KEY(`id`)
);
