CREATE TABLE `drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`trigger_message_id` integer NOT NULL,
	`status` text NOT NULL,
	`generated_text` text,
	`model` text,
	`prompt_version` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`reasoning_tokens` integer,
	`cached_input_tokens` integer,
	`latency_ms` integer,
	`context_message_count` integer,
	`error_kind` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trigger_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_trigger_message_unique` ON `drafts` (`trigger_message_id`);--> statement-breakpoint
CREATE INDEX `drafts_conversation_created_idx` ON `drafts` (`conversation_id`,`created_at`);