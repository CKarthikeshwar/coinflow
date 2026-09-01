CREATE TABLE `account_rule` (
	`normalizedKey` text PRIMARY KEY NOT NULL,
	`displayAccount` text NOT NULL,
	`lastNote` text,
	`categoryId` text,
	`lastPaymentMethod` text,
	`hitCount` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_rule_prefix` ON `account_rule` (`displayAccount`);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`kind` text NOT NULL,
	`isProtected` integer DEFAULT false NOT NULL,
	`order` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_key_unique` ON `category` (`key`);--> statement-breakpoint
CREATE TABLE `suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`amountMinor` integer,
	`direction` text,
	`occurredAt` integer,
	`account` text,
	`normalizedKey` text,
	`paymentMethod` text,
	`smsSender` text NOT NULL,
	`smsReceivedAt` integer NOT NULL,
	`dedupeKey` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirmedTransactionId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`confirmedTransactionId`) REFERENCES `transaction`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_sugg_status` ON `suggestion` (`status`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sugg_dedupe` ON `suggestion` (`dedupeKey`);--> statement-breakpoint
CREATE TABLE `transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`amountMinor` integer NOT NULL,
	`direction` text NOT NULL,
	`type` text NOT NULL,
	`categoryId` text,
	`paymentMethod` text,
	`account` text,
	`normalizedAccountKey` text,
	`note` text,
	`description` text,
	`searchText` text,
	`occurredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`source` text NOT NULL,
	`smsSender` text,
	`smsReceivedAt` integer,
	`dedupeKey` text,
	`editedByUser` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_txn_occurred` ON `transaction` (`deletedAt`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `idx_txn_type_occurred` ON `transaction` (`deletedAt`,`type`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `idx_txn_category` ON `transaction` (`deletedAt`,`categoryId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `idx_txn_dedupe` ON `transaction` (`dedupeKey`);--> statement-breakpoint
CREATE INDEX `idx_txn_normkey` ON `transaction` (`normalizedAccountKey`);