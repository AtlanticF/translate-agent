CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `messages` text NOT NULL,
  `copilot_responses` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
