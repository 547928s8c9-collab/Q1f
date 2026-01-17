CREATE TABLE "admin_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"actor_admin_user_id" varchar NOT NULL,
	"request_id" varchar,
	"ip" text,
	"user_agent" text,
	"action_type" text NOT NULL,
	"target_type" text,
	"target_id" varchar,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "admin_idempotency_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"actor_admin_user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"payload_hash" text,
	"response_json" jsonb,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_inbox_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"type" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"owner_admin_user_id" varchar,
	"next_action" text,
	"entity_type" text,
	"entity_id" varchar,
	"user_id" varchar,
	"payload_json" jsonb,
	"resolved_at" timestamp,
	"resolved_by_admin_user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"event" text NOT NULL,
	"resource_type" text,
	"resource_id" varchar,
	"details" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"asset" text NOT NULL,
	"available" text DEFAULT '0' NOT NULL,
	"locked" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"version" text NOT NULL,
	"document_type" text NOT NULL,
	"doc_hash" text NOT NULL,
	"accepted_at" timestamp DEFAULT now(),
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"endpoint" text NOT NULL,
	"operation_id" varchar,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_by_admin_user_id" varchar NOT NULL,
	"resolved_by_admin_user_id" varchar,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "kyc_applicants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"level" text DEFAULT 'basic',
	"provider_ref" text,
	"risk_level" text,
	"pep_flag" boolean DEFAULT false,
	"rejection_reason" text,
	"needs_action_reason" text,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "kyc_applicants_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "market_candles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange" text DEFAULT 'binance_spot' NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"ts" bigint NOT NULL,
	"open" text NOT NULL,
	"high" text NOT NULL,
	"low" text NOT NULL,
	"close" text NOT NULL,
	"volume" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_live_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"ts" bigint NOT NULL,
	"price" text NOT NULL,
	"source" text DEFAULT 'sim',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"resource_type" text,
	"resource_id" varchar,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"asset" text,
	"amount" text,
	"fee" text DEFAULT '0',
	"tx_hash" text,
	"provider_ref" text,
	"strategy_id" varchar,
	"strategy_name" text,
	"from_vault" text,
	"to_vault" text,
	"metadata" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"event_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"actor_admin_user_id" varchar,
	"processed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "payout_instructions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"strategy_id" varchar NOT NULL,
	"frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"address_id" varchar,
	"min_payout_minor" text DEFAULT '10000000' NOT NULL,
	"active" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pending_admin_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'PENDING' NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"maker_admin_user_id" varchar NOT NULL,
	"checker_admin_user_id" varchar,
	"payload_json" jsonb NOT NULL,
	"reason" text,
	"decision_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "portfolio_series" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"strategy_id" varchar NOT NULL,
	"principal" text DEFAULT '0' NOT NULL,
	"current_value" text DEFAULT '0' NOT NULL,
	"principal_minor" text DEFAULT '0' NOT NULL,
	"invested_current_minor" text DEFAULT '0' NOT NULL,
	"accrued_profit_payable_minor" text DEFAULT '0' NOT NULL,
	"last_accrual_date" text,
	"paused" boolean DEFAULT false NOT NULL,
	"dd_limit_pct" integer DEFAULT 0 NOT NULL,
	"auto_pause_enabled" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp,
	"paused_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair" text NOT NULL,
	"date" text NOT NULL,
	"price" text NOT NULL,
	"change_24h" text
);
--> statement-breakpoint
CREATE TABLE "redemption_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"strategy_id" varchar NOT NULL,
	"amount_minor" text,
	"requested_at" timestamp DEFAULT now(),
	"execute_at" timestamp NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"executed_amount_minor" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "security_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"contact_verified" boolean DEFAULT false,
	"consent_accepted" boolean DEFAULT false,
	"kyc_status" text DEFAULT 'pending',
	"two_factor_enabled" boolean DEFAULT false,
	"anti_phishing_code" text,
	"whitelist_enabled" boolean DEFAULT false,
	"address_delay" integer DEFAULT 0,
	"auto_sweep_enabled" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "security_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sim_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"seq" bigint NOT NULL,
	"ts" bigint NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profile_slug" text NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint,
	"speed" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"config_overrides" jsonb,
	"error_message" text,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"cursor_ms" bigint,
	"lag_ms" integer DEFAULT 900000 NOT NULL,
	"replay_ms_per_candle" integer DEFAULT 15000 NOT NULL,
	"mode" text DEFAULT 'replay' NOT NULL,
	"idempotency_key" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sim_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"ts" bigint NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"qty" text NOT NULL,
	"price" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"risk_tier" text NOT NULL,
	"base_asset" text DEFAULT 'USDT' NOT NULL,
	"pairs_json" jsonb,
	"expected_monthly_range_bps_min" integer,
	"expected_monthly_range_bps_max" integer,
	"fees_json" jsonb,
	"terms_json" jsonb,
	"min_investment" text DEFAULT '100000000' NOT NULL,
	"worst_month" text,
	"max_drawdown" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_performance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" varchar NOT NULL,
	"day" integer NOT NULL,
	"date" text NOT NULL,
	"equity_minor" text NOT NULL,
	"benchmark_btc_minor" text,
	"benchmark_eth_minor" text
);
--> statement-breakpoint
CREATE TABLE "strategy_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"description" text NOT NULL,
	"profile_key" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"risk_level" text NOT NULL,
	"default_config" jsonb NOT NULL,
	"config_schema" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "strategy_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "strategy_series" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" varchar NOT NULL,
	"date" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"asset" text DEFAULT 'USDT' NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"goal_name" text,
	"goal_amount" text,
	"auto_sweep_pct" integer DEFAULT 0,
	"auto_sweep_enabled" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whitelist_addresses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"network" text DEFAULT 'TRC20',
	"status" text DEFAULT 'PENDING_ACTIVATION',
	"activates_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar NOT NULL,
	"amount_minor" text NOT NULL,
	"fee_minor" text DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USDT' NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"operation_id" varchar,
	"risk_score" integer,
	"risk_flags" jsonb,
	"last_error" text,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejected_by" varchar,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"processed_at" timestamp,
	"completed_at" timestamp,
	"tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_admin_user_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_idempotency_keys" ADD CONSTRAINT "admin_idempotency_keys_actor_admin_user_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_owner_admin_user_id_admin_users_id_fk" FOREIGN KEY ("owner_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_resolved_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_applicants" ADD CONSTRAINT "kyc_applicants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_instructions" ADD CONSTRAINT "payout_instructions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_instructions" ADD CONSTRAINT "payout_instructions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_instructions" ADD CONSTRAINT "payout_instructions_address_id_whitelist_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."whitelist_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_admin_actions" ADD CONSTRAINT "pending_admin_actions_maker_admin_user_id_admin_users_id_fk" FOREIGN KEY ("maker_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_admin_actions" ADD CONSTRAINT "pending_admin_actions_checker_admin_user_id_admin_users_id_fk" FOREIGN KEY ("checker_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_series" ADD CONSTRAINT "portfolio_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_events" ADD CONSTRAINT "sim_events_session_id_sim_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sim_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_sessions" ADD CONSTRAINT "sim_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_trades" ADD CONSTRAINT "sim_trades_session_id_sim_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sim_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_performance" ADD CONSTRAINT "strategy_performance_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_series" ADD CONSTRAINT "strategy_series_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_addresses" ADD CONSTRAINT "whitelist_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" USING btree ("actor_admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_request_id_idx" ON "admin_audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_idempotency_unique_idx" ON "admin_idempotency_keys" USING btree ("actor_admin_user_id","endpoint","idempotency_key");--> statement-breakpoint
CREATE INDEX "admin_idempotency_created_at_idx" ON "admin_idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_inbox_status_priority_created_idx" ON "admin_inbox_items" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "admin_inbox_owner_status_idx" ON "admin_inbox_items" USING btree ("owner_admin_user_id","status");--> statement-breakpoint
CREATE INDEX "admin_inbox_type_status_created_idx" ON "admin_inbox_items" USING btree ("type","status","created_at");--> statement-breakpoint
CREATE INDEX "admin_inbox_entity_idx" ON "admin_inbox_items" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_roles_unique_idx" ON "admin_user_roles" USING btree ("admin_user_id","role_id");--> statement-breakpoint
CREATE INDEX "admin_user_roles_admin_user_id_idx" ON "admin_user_roles" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_user_id_idx" ON "admin_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_users_email_idx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_user_key_endpoint_idx" ON "idempotency_keys" USING btree ("user_id","idempotency_key","endpoint");--> statement-breakpoint
CREATE INDEX "incidents_status_starts_at_idx" ON "incidents" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "incidents_created_at_idx" ON "incidents" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_candles_unique_idx" ON "market_candles" USING btree ("exchange","symbol","timeframe","ts");--> statement-breakpoint
CREATE INDEX "market_candles_symbol_tf_ts_idx" ON "market_candles" USING btree ("symbol","timeframe","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "market_live_quotes_symbol_unique_idx" ON "market_live_quotes" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "market_live_quotes_ts_idx" ON "market_live_quotes" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "operations_user_created_idx" ON "operations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "operations_user_type_created_idx" ON "operations" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_processed_at_idx" ON "outbox_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_event_type_idx" ON "outbox_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "pending_admin_actions_status_created_idx" ON "pending_admin_actions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pending_admin_actions_action_type_created_idx" ON "pending_admin_actions" USING btree ("action_type","created_at");--> statement-breakpoint
CREATE INDEX "pending_admin_actions_target_idx" ON "pending_admin_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "pending_admin_actions_maker_idx" ON "pending_admin_actions" USING btree ("maker_admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_unique_idx" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_events_session_seq_idx" ON "sim_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "sim_events_session_ts_idx" ON "sim_events" USING btree ("session_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_sessions_user_idempotency_idx" ON "sim_sessions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "sim_sessions_user_status_idx" ON "sim_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sim_trades_session_ts_idx" ON "sim_trades" USING btree ("session_id","ts");--> statement-breakpoint
CREATE INDEX "sim_trades_symbol_ts_idx" ON "sim_trades" USING btree ("symbol","ts");--> statement-breakpoint
CREATE INDEX "whitelist_user_created_idx" ON "whitelist_addresses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_created_idx" ON "withdrawals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_user_created_idx" ON "withdrawals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_operation_idx" ON "withdrawals" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");