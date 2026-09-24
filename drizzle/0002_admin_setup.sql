CREATE TABLE `admin_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `username` varchar(80) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_accounts_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_accounts_userId_unique` UNIQUE(`userId`),
  CONSTRAINT `admin_accounts_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `admin_sessions_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
