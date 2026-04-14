CREATE TABLE `workspace_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`external_id` text,
	`host` text,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text,
	`worktree_path` text,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`error_message` text,
	`stderr_log` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ready_at` text,
	`terminated_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `uses_workspace_provider` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_instances_task_id_unique` ON `workspace_instances` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_instances_status` ON `workspace_instances` (`status`);