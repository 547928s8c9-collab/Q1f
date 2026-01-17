CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "balances_user_id_idx" ON "balances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consents_user_doc_created_idx" ON "consents" USING btree ("user_id","document_type","created_at");--> statement-breakpoint
CREATE INDEX "kyc_applicants_status_created_idx" ON "kyc_applicants" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_series_user_date_idx" ON "portfolio_series" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "positions_user_strategy_idx" ON "positions" USING btree ("user_id","strategy_id");--> statement-breakpoint
CREATE INDEX "quotes_pair_date_idx" ON "quotes" USING btree ("pair","date");--> statement-breakpoint
CREATE INDEX "redemption_requests_user_status_execute_idx" ON "redemption_requests" USING btree ("user_id","status","execute_at");--> statement-breakpoint
CREATE INDEX "strategy_series_strategy_date_idx" ON "strategy_series" USING btree ("strategy_id","date");--> statement-breakpoint
CREATE INDEX "vaults_user_id_idx" ON "vaults" USING btree ("user_id");