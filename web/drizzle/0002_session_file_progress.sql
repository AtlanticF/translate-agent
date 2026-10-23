ALTER TABLE `session_files` ADD `status` text DEFAULT 'open' NOT NULL;
ALTER TABLE `session_files` ADD `covered` text DEFAULT '[]' NOT NULL;
ALTER TABLE `session_files` ADD `source_chars` integer DEFAULT 0 NOT NULL;
