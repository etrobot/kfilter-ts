CREATE TABLE `stock_info` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`info` text,
	`daily` text,
	`weekly` text,
	`monthly` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_info_symbol_idx` ON `stock_info` (`symbol`);--> statement-breakpoint
CREATE INDEX `stock_info_updated_at_idx` ON `stock_info` (`updated_at`);