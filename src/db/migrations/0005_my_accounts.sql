CREATE TABLE `account_balance` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`balanceMinor` integer NOT NULL,
	`asOf` integer NOT NULL,
	`source` text NOT NULL,
	`dedupeKey` text NOT NULL,
	`acknowledgedAt` integer,
	FOREIGN KEY (`accountId`) REFERENCES `my_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_balance_dedupeKey_unique` ON `account_balance` (`dedupeKey`);--> statement-breakpoint
CREATE INDEX `idx_balance_account_asof` ON `account_balance` (`accountId`,`asOf`);--> statement-breakpoint
CREATE TABLE `my_account` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`nickname` text NOT NULL,
	`bankName` text,
	`bankKey` text,
	`last4` text,
	`matchKey` text,
	`autoCreated` integer DEFAULT false NOT NULL,
	`archivedAt` integer,
	`creditLimitMinor` integer,
	`dueAt` integer,
	`dueAmountMinor` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `my_account_matchKey_unique` ON `my_account` (`matchKey`);--> statement-breakpoint
ALTER TABLE `suggestion` ADD `accountId` text;--> statement-breakpoint
ALTER TABLE `transaction` ADD `accountId` text REFERENCES my_account(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `transaction` ADD `transferPeerId` text;--> statement-breakpoint
CREATE INDEX `idx_txn_account` ON `transaction` (`accountId`);