CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`displayName` text NOT NULL,
	`phoneKey` text,
	`phoneDisplay` text,
	`contactRef` text,
	`source` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_person_phone` ON `person` (`phoneKey`);--> statement-breakpoint
CREATE TABLE `settlement` (
	`id` text PRIMARY KEY NOT NULL,
	`shareId` text,
	`requestId` text,
	`transactionId` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`shareId`) REFERENCES `split_share`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requestId`) REFERENCES `split_request_in`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transactionId`) REFERENCES `transaction`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_settlement_amount_positive" CHECK("settlement"."amountMinor" > 0),
	CONSTRAINT "chk_settlement_one_target" CHECK(("settlement"."shareId" IS NULL) <> ("settlement"."requestId" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_settlement_txn` ON `settlement` (`transactionId`);--> statement-breakpoint
CREATE INDEX `idx_settlement_share` ON `settlement` (`shareId`);--> statement-breakpoint
CREATE INDEX `idx_settlement_request` ON `settlement` (`requestId`);--> statement-breakpoint
CREATE TABLE `split_request_in` (
	`id` text PRIMARY KEY NOT NULL,
	`fromPhoneKey` text NOT NULL,
	`fromPersonId` text,
	`fromLabel` text NOT NULL,
	`remoteRef` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`forNote` text,
	`receivedAt` integer NOT NULL,
	`status` text DEFAULT 'unattended' NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`fromPersonId`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_reqin_amount_positive" CHECK("split_request_in"."amountMinor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_reqin_sender_ref` ON `split_request_in` (`fromPhoneKey`,`remoteRef`);--> statement-breakpoint
CREATE INDEX `idx_reqin_status` ON `split_request_in` (`status`,`receivedAt`);--> statement-breakpoint
CREATE TABLE `split_share` (
	`id` text PRIMARY KEY NOT NULL,
	`splitId` text NOT NULL,
	`personId` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`requestState` text DEFAULT 'not_sent' NOT NULL,
	`requestSentAt` integer,
	`requestedAmountMinor` integer,
	`waivedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`splitId`) REFERENCES `split`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`personId`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_share_amount_positive" CHECK("split_share"."amountMinor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_share_split_person` ON `split_share` (`splitId`,`personId`);--> statement-breakpoint
CREATE INDEX `idx_share_person` ON `split_share` (`personId`);--> statement-breakpoint
CREATE TABLE `split` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`transactionId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`transactionId`) REFERENCES `transaction`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_split_ref` ON `split` (`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_split_txn` ON `split` (`transactionId`);