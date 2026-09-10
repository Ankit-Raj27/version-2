-- Phase 9: per-contact memory facts.
-- Facts are inserted 'proposed' and only reach a prompt once a human confirms them.
-- 'rejected' rows are retained so the extractor can be told not to re-propose them.
CREATE TABLE `memory_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`fact` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`source_message_id` integer,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_facts_contact_fact_uq` ON `memory_facts` (`contact_id`,`fact`);--> statement-breakpoint
CREATE INDEX `memory_facts_contact_status_idx` ON `memory_facts` (`contact_id`,`status`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_memory_message_id` integer;
