CREATE TABLE `ingestion_host_rate_limits` (
	`host` text PRIMARY KEY NOT NULL,
	`minimum_interval_ms` integer DEFAULT 0 NOT NULL,
	`next_request_at_ms` integer DEFAULT 0 NOT NULL,
	`last_request_started_at_ms` integer,
	`lease_token` text,
	`lease_expires_at_ms` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ingestion_host_rate_limits_interval_check" CHECK("ingestion_host_rate_limits"."minimum_interval_ms" >= 0),
	CONSTRAINT "ingestion_host_rate_limits_next_request_check" CHECK("ingestion_host_rate_limits"."next_request_at_ms" >= 0),
	CONSTRAINT "ingestion_host_rate_limits_lease_pair_check" CHECK(("ingestion_host_rate_limits"."lease_token" IS NULL AND "ingestion_host_rate_limits"."lease_expires_at_ms" IS NULL) OR ("ingestion_host_rate_limits"."lease_token" IS NOT NULL AND "ingestion_host_rate_limits"."lease_expires_at_ms" IS NOT NULL))
);
