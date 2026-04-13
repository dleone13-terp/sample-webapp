CREATE TABLE `bill_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`filename` text NOT NULL,
	`content_type` text,
	`file_size` integer,
	`document_type` text,
	`notes` text,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bill_documents_bill_id` ON `bill_documents` (`bill_id`);--> statement-breakpoint
CREATE TABLE `bill_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`description` text,
	`created_by` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bill_events_bill_id` ON `bill_events` (`bill_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_number` text NOT NULL,
	`customer_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`carrier` text,
	`tracking_number` text,
	`service_type` text,
	`freight_class` text,
	`origin_address` text,
	`origin_city` text,
	`origin_state` text,
	`origin_zip` text,
	`destination_address` text,
	`destination_city` text,
	`destination_state` text,
	`destination_zip` text,
	`weight` real,
	`weight_unit` text DEFAULT 'lbs' NOT NULL,
	`pieces` integer,
	`description` text,
	`amount` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`pickup_date` text,
	`estimated_delivery` text,
	`actual_delivery` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_bill_number_unique` ON `bills` (`bill_number`);--> statement-breakpoint
CREATE INDEX `idx_bills_customer_id` ON `bills` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_bills_status` ON `bills` (`status`);--> statement-breakpoint
CREATE INDEX `idx_bills_bill_number` ON `bills` (`bill_number`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`company` text,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`country` text DEFAULT 'US' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
