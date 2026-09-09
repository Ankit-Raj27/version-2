DROP INDEX `drafts_trigger_message_unique`;--> statement-breakpoint
ALTER TABLE `drafts` ADD `final_text` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `sent_message_id` integer REFERENCES messages(id);--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_trigger_active_uq` ON `drafts` (`trigger_message_id`) WHERE "drafts"."status" != 'superseded';