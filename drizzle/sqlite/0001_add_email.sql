ALTER TABLE `leads` ADD COLUMN `email` text;
--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD COLUMN `lead_email` text;
