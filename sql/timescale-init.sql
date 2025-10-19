-- GraphQL Analytics - TimescaleDB Features
-- 
-- NOTE: The request_logs table is created by Drizzle migrations.
-- This file only adds TimescaleDB-specific features that Drizzle can't handle.
--
-- Run this AFTER running `pnpm migrate:push`:
--   docker cp ./sql/timescale-init.sql patiom-timescale:/tmp/
--   docker compose exec timescale psql -U patiom -d patiom -f /tmp/timescale-init.sql
--
-- This schema uses TimescaleDB Continuous Aggregates instead of manual aggregation tables.
-- Continuous Aggregates auto-update as new data arrives - no cron jobs needed!
--
-- Query them like regular tables:
--   SELECT * FROM operation_stats_hourly WHERE project_id = 'x' AND bucket >= NOW() - INTERVAL '24 hours';
--   SELECT * FROM operation_stats_daily WHERE project_id = 'x' ORDER BY bucket DESC LIMIT 30;
--   SELECT * FROM field_usage_stats_daily WHERE field_path = 'User.email' AND bucket >= NOW() - INTERVAL '7 days';

-- Convert existing request_logs table to hypertable (time-series optimized table)
-- Partition by time with 1-day chunks (better for daily queries and high volume)
SELECT create_hypertable('request_logs', 'timestamp', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Note: Standard indexes are created by Drizzle migrations
-- Only create TimescaleDB-specific indexes here

-- GIN index for JSONB array field queries (e.g., find all requests using "User.email")
CREATE INDEX IF NOT EXISTS idx_request_logs_requested_fields ON request_logs USING GIN (requested_fields);

-- TimescaleDB Continuous Aggregates for real-time analytics
-- Real-time mode: materialized_only=false means recent data is computed on-the-fly
-- Hourly aggregation for operations
DROP MATERIALIZED VIEW IF EXISTS operation_stats_hourly CASCADE;
CREATE MATERIALIZED VIEW operation_stats_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only=false) AS
SELECT 
    time_bucket('1 hour', timestamp) AS bucket,
    project_id,
    operation_name,
    COUNT(*) as total_requests,
    AVG(elapsed_ms) as avg_latency_ms,
    MIN(elapsed_ms) as min_latency_ms,
    MAX(elapsed_ms) as max_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) as p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) as p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY elapsed_ms) as p99_latency_ms,
    SUM(response_size_bytes) as total_response_size_bytes,
    SUM(error_count) as error_count
FROM request_logs
GROUP BY bucket, project_id, operation_name
WITH NO DATA;

-- Add refresh policy to update the continuous aggregate
-- Refreshes every 5 minutes for near-real-time analytics
-- Window must cover at least 2 buckets (2 hours for hourly aggregates)
SELECT add_continuous_aggregate_policy('operation_stats_hourly',
    start_offset => INTERVAL '4 hours',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE
);

-- Daily aggregation for operations
DROP MATERIALIZED VIEW IF EXISTS operation_stats_daily CASCADE;
CREATE MATERIALIZED VIEW operation_stats_daily
WITH (timescaledb.continuous, timescaledb.materialized_only=false) AS
SELECT 
    time_bucket('1 day', timestamp) AS bucket,
    project_id,
    operation_name,
    COUNT(*) as total_requests,
    AVG(elapsed_ms) as avg_latency_ms,
    MIN(elapsed_ms) as min_latency_ms,
    MAX(elapsed_ms) as max_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) as p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) as p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY elapsed_ms) as p99_latency_ms,
    SUM(response_size_bytes) as total_response_size_bytes,
    SUM(error_count) as error_count
FROM request_logs
GROUP BY bucket, project_id, operation_name
WITH NO DATA;

-- Add refresh policy for daily stats
-- Refreshes every hour to include "today so far" data
-- Window must cover at least 2 buckets (3 days for daily aggregates)
SELECT add_continuous_aggregate_policy('operation_stats_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily field usage aggregation
-- This unnests the requested_fields array and aggregates by field path
DROP MATERIALIZED VIEW IF EXISTS field_usage_stats_daily CASCADE;
CREATE MATERIALIZED VIEW field_usage_stats_daily
WITH (timescaledb.continuous, timescaledb.materialized_only=false) AS
SELECT 
    time_bucket('1 day', timestamp) AS bucket,
    project_id,
    field_path,
    COUNT(*) as usage_count
FROM request_logs,
     jsonb_array_elements_text(requested_fields) AS field_path
GROUP BY bucket, project_id, field_path
WITH NO DATA;

-- Add refresh policy for field usage stats
-- Refreshes every hour for up-to-date field usage tracking
-- Window must cover at least 2 buckets (3 days for daily aggregates)
SELECT add_continuous_aggregate_policy('field_usage_stats_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Enable compression on the hypertable
ALTER TABLE request_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'project_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- Compression policy - compress data older than 7 days
SELECT add_compression_policy('request_logs', 
    INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Retention policy - keep data for 90 days (adjust as needed)
-- Uncomment when ready to enable automatic data deletion
-- SELECT add_retention_policy('request_logs', 
--     INTERVAL '90 days',
--     if_not_exists => TRUE
-- );

-- Helper view for recent operations (last 24 hours)
DROP VIEW IF EXISTS recent_operations CASCADE;
CREATE VIEW recent_operations AS
SELECT 
    project_id,
    operation_name,
    COUNT(*) as total_requests,
    AVG(elapsed_ms) as avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) as p95_latency_ms,
    (SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100) as error_rate_pct
FROM request_logs 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY project_id, operation_name
ORDER BY total_requests DESC;

-- Helper view for error tracking
-- Helper view for error tracking
DROP VIEW IF EXISTS error_logs CASCADE;
CREATE VIEW error_logs AS
SELECT 
    id,
    timestamp,
    project_id,
    operation_name,
    elapsed_ms,
    status_code,
    errors,
    ip,
    user_agent
FROM request_logs
WHERE error_count > 0
ORDER BY timestamp DESC;

-- Comment on tables for documentation
COMMENT ON TABLE request_logs IS 'TimescaleDB hypertable storing all GraphQL request logs with automatic partitioning by time';
