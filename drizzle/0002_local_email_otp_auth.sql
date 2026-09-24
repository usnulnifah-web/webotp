CREATE TABLE `auth_rate_limits` (
	`key` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`windowStartedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_rate_limits_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `localEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `pendingPasswordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `pendingName` varchar(160);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `emailOtpHash` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `emailOtpExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `emailOtpAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_localEmail_unique` UNIQUE(`localEmail`);