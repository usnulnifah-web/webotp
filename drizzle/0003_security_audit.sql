CREATE TABLE `admin_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(80) NOT NULL,
	`ipAddress` varchar(64) NOT NULL,
	`failedCount` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_login_identity_idx` UNIQUE(`username`,`ipAddress`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(80) NOT NULL,
	`ipAddress` varchar(64),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
