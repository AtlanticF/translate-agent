ALTER TABLE `sessions` ADD `user_id` text;
CREATE INDEX `sessions_user_updated_idx` ON `sessions` (`user_id`, `updated_at`);
