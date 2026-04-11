CREATE TABLE `workspace_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`external_id` text,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text,
	`worktree_path` text,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`connection_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`terminated_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `ssh_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `workspace_instance_id` text REFERENCES workspace_instances(id);--> statement-breakpoint
CREATE INDEX `idx_workspace_instances_task_id` ON `workspace_instances` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_instances_status` ON `workspace_instances` (`status`);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/