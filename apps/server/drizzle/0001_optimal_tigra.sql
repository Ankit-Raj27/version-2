CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`whatsapp_jid` text NOT NULL,
	`alt_jid` text,
	`display_name` text,
	`relationship` text,
	`reply_mode` text DEFAULT 'OFF' NOT NULL,
	`notes` text,
	`style_profile` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_whatsapp_jid_uq` ON `contacts` (`whatsapp_jid`);--> statement-breakpoint
CREATE INDEX `contacts_alt_jid_idx` ON `contacts` (`alt_jid`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_conversation_id` text NOT NULL,
	`contact_id` integer,
	`type` text NOT NULL,
	`title` text,
	`summary` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_id_uq` ON `conversations` (`external_conversation_id`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`external_message_id` text NOT NULL,
	`sender_id` integer,
	`direction` text NOT NULL,
	`type` text NOT NULL,
	`text` text,
	`origin` text NOT NULL,
	`quoted_external_message_id` text,
	`quoted_message_id` integer,
	`timestamp` integer NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`quoted_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_conv_ext_uq` ON `messages` (`conversation_id`,`external_message_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_timestamp_idx` ON `messages` (`conversation_id`,`timestamp`);