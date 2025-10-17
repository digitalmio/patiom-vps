-- GraphQL Analytics Logs Schema for TimescaleDB
-- TimescaleDB extension must be enabled first: CREATE EXTENSION IF NOT EXISTS timescaledb;
--
-- This schema uses TimescaleDB Continuous Aggregates instead of manual aggregation tables.
-- Continuous Aggregates auto-update as new data arrives - no cron jobs needed!
--
-- Query them like regular tables:
--   SELECT * FROM operation_stats_hourly WHERE project_id = 'x' AND bucket >= NOW() - INTERVAL '24 hours';
--   SELECT * FROM operation_stats_daily WHERE project_id = 'x' ORDER BY bucket DESC LIMIT 30;
--   SELECT * FROM field_usage_stats_daily WHERE field_path = 'User.email' AND bucket >= NOW() - INTERVAL '7 days';

-- Raw request logs (detailed per-request data)
-- This will be converted to a hypertable for time-series optimization
CREATE TABLE request_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    project_id TEXT NOT NULL,
    
    -- GraphQL Operation
    operation_name VARCHAR(255),
    operation TEXT NOT NULL,
    variable_hash BIGINT,
    
    -- Performance
    elapsed_ms INTEGER NOT NULL,
    response_size_bytes INTEGER,
    response_hash BIGINT NOT NULL,
    
    -- Client Info
    graphql_client_name VARCHAR(100),
    graphql_client_version VARCHAR(50),
    
    -- Network
    method VARCHAR(10) DEFAULT 'POST' NOT NULL,
    status_code INTEGER DEFAULT 200 NOT NULL,
    has_set_cookie BOOLEAN DEFAULT FALSE,
    referer TEXT,
    user_agent TEXT,
    ip VARCHAR(45), -- IPv6 max length
    
    -- Cache variation tracking
    vary_hash BIGINT,
    
    -- GraphQL Metrics
    error_count INTEGER DEFAULT 0,
    errors JSONB,
    
    -- Parsed field usage (populated by worker after parsing GraphQL query)
    -- e.g., ["Query.user", "User.id", "User.email", "User.posts", "Post.title"]
    requested_fields JSONB,
    
    -- Partitioning hint (computed column)
    date_partition DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED
);

-- Convert to hypertable (time-series optimized table)
-- Partition by time with 7-day chunks
SELECT create_hypertable('request_logs', 'timestamp', 
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Create indexes for common query patterns
CREATE INDEX idx_request_logs_project_timestamp ON request_logs (project_id, timestamp DESC);
CREATE INDEX idx_request_logs_project_operation ON request_logs (project_id, operation_name, timestamp DESC);
CREATE INDEX idx_request_logs_project_status ON request_logs (project_id, status_code, timestamp DESC);
CREATE INDEX idx_request_logs_date_partition ON request_logs (date_partition, project_id);
CREATE INDEX idx_request_logs_operation_hash ON request_logs (project_id, response_hash);
-- GIN index for array field queries (e.g., find all requests using "User.email")
CREATE INDEX idx_request_logs_requested_fields ON request_logs USING GIN (requested_fields);

-- TimescaleDB Continuous Aggregates for real-time analytics
-- Hourly aggregation for operations
CREATE MATERIALIZED VIEW operation_stats_hourly
WITH (timescaledb.continuous) AS
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
SELECT add_continuous_aggregate_policy('operation_stats_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily aggregation for operations
CREATE MATERIALIZED VIEW operation_stats_daily
WITH (timescaledb.continuous) AS
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
SELECT add_continuous_aggregate_policy('operation_stats_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Daily field usage aggregation
-- This unnests the requested_fields array and aggregates by field path
CREATE MATERIALIZED VIEW field_usage_stats_daily
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', timestamp) AS bucket,
    project_id,
    field_path,
    COUNT(*) as total_requests,
    SUM(elapsed_ms) as total_latency_ms,
    SUM(error_count) as error_count
FROM request_logs, 
     jsonb_array_elements_text(requested_fields) AS field_path
GROUP BY bucket, project_id, field_path
WITH NO DATA;

-- Add refresh policy for field usage stats
SELECT add_continuous_aggregate_policy('field_usage_stats_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
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
COMMENT ON TABLE operation_stats IS 'Pre-aggregated daily statistics for GraphQL operations';
COMMENT ON TABLE field_usage_stats IS 'Daily aggregated statistics for GraphQL field usage';
COMMENT ON MATERIALIZED VIEW operation_stats_hourly IS 'TimescaleDB continuous aggregate with hourly operation statistics';
COMMENT ON MATERIALIZED VIEW operation_stats_daily IS 'TimescaleDB continuous aggregate with daily operation statistics';
