ALTER TABLE `account_rule` ADD `incomeCategoryId` text REFERENCES category(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `category` ADD `appliesTo` text DEFAULT 'expense' NOT NULL;