CREATE TABLE `automation_run_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error` text,
	`task_id` text,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`agent_id` text NOT NULL,
	`mode` text DEFAULT 'schedule' NOT NULL,
	`schedule` text NOT NULL,
	`trigger_type` text,
	`trigger_config` text,
	`use_worktree` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`run_count` integer DEFAULT 0 NOT NULL,
	`last_run_result` text,
	`last_run_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_logs_automation_started` ON `automation_run_logs` (`automation_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_automation_run_logs_status` ON `automation_run_logs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_automations_project_id` ON `automations` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_automations_status_next_run` ON `automations` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_automations_updated_at` ON `automations` (`updated_at`);