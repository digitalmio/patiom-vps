-- GraphQL Analytics Schema for DuckDB/MotherDuck
-- Compatible with pre-1.4 versions

-- Raw request logs (detailed per-request data)
CREATE TABLE request_logs (
    request_id VARCHAR PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    
    -- GraphQL Operation
    operation_name VARCHAR,
    operation_type VARCHAR, -- query/mutation/subscription
    operation TEXT,
    variable_hash BIGINT,
    
    -- Performance
    elapsed_ms INTEGER NOT NULL,
    response_size_bytes INTEGER,
    response_hash BIGINT,
    
    -- Client Info
    graphql_client_name VARCHAR,
    graphql_client_version VARCHAR,
    
    -- Device/Browser (parsed from User Agent)
    browser VARCHAR,
    browser_version VARCHAR,
    os VARCHAR,
    device_type VARCHAR, -- Mobile/Desktop/Tablet/Bot
    is_bot BOOLEAN DEFAULT FALSE,
    
    -- Network
    method VARCHAR DEFAULT 'POST',
    status_code INTEGER NOT NULL,
    has_set_cookie BOOLEAN DEFAULT FALSE,
    referer VARCHAR,
    user_agent_hash VARCHAR, -- for session-like tracking
    
    -- GraphQL Metrics
    query_depth INTEGER,
    field_count INTEGER,
    error_count INTEGER DEFAULT 0,
    errors JSON,
    
    -- Multi-tenancy
    customer_id VARCHAR NOT NULL,
    
    -- Partitioning hint for performance
    date_partition DATE GENERATED ALWAYS AS (CAST(timestamp AS DATE))
);

-- Schema versions (track schema evolution)
CREATE TABLE schema_versions (
    schema_version_id VARCHAR PRIMARY KEY, -- nanoid or similar
    customer_id VARCHAR NOT NULL,
    schema_hash VARCHAR NOT NULL, -- hash of full introspection result
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Schema metadata
    type_count INTEGER,
    field_count INTEGER,
    operation_count INTEGER,
    
    -- Change detection
    previous_version_id VARCHAR,
    changes_summary JSON -- {"added_types": [...], "removed_fields": [...], "deprecated_fields": [...]}
);

-- Schema types (populated from schema introspection)
CREATE TABLE schema_types (
    type_id VARCHAR PRIMARY KEY, -- composite: schema_version_id:type_name
    type_name VARCHAR NOT NULL,
    type_kind VARCHAR NOT NULL, -- OBJECT, SCALAR, ENUM, INTERFACE, UNION
    description TEXT,
    field_count INTEGER DEFAULT 0,
    is_builtin BOOLEAN DEFAULT FALSE,
    schema_version_id VARCHAR NOT NULL,
    customer_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Usage analytics (updated periodically)
    total_requests INTEGER DEFAULT 0,
    last_seen TIMESTAMP
);

-- Schema fields (populated from schema introspection)
CREATE TABLE schema_fields (
    field_id VARCHAR PRIMARY KEY, -- composite: schema_version_id:parent_type:field_name
    field_name VARCHAR NOT NULL,
    field_path VARCHAR NOT NULL, -- "Product.price", "Query.allProducts"
    parent_type VARCHAR NOT NULL,
    return_type VARCHAR NOT NULL,
    is_list BOOLEAN DEFAULT FALSE,
    is_nullable BOOLEAN DEFAULT TRUE,
    has_arguments BOOLEAN DEFAULT FALSE,
    argument_count INTEGER DEFAULT 0,
    description TEXT,
    deprecation_reason TEXT,
    schema_version_id VARCHAR NOT NULL,
    customer_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Usage analytics (updated periodically)
    total_requests INTEGER DEFAULT 0,
    total_latency_ms BIGINT DEFAULT 0, -- sum for average calculation
    error_count INTEGER DEFAULT 0,
    last_seen TIMESTAMP
);

-- Operations analytics (aggregated data for dashboard performance)
CREATE TABLE operation_stats (
    stat_id VARCHAR PRIMARY KEY, -- composite: customer_id:operation_name:date
    customer_id VARCHAR NOT NULL,
    operation_name VARCHAR,
    operation_type VARCHAR,
    date_bucket DATE NOT NULL, -- daily aggregation
    
    -- Aggregated metrics
    total_requests INTEGER DEFAULT 0,
    total_latency_ms BIGINT DEFAULT 0,
    min_latency_ms INTEGER,
    max_latency_ms INTEGER,
    p50_latency_ms INTEGER,
    p95_latency_ms INTEGER,
    p99_latency_ms INTEGER,
    
    total_response_size_bytes BIGINT DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    -- Client breakdown
    client_stats JSON, -- {"mobile": 1200, "web": 3400}
    browser_stats JSON,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Field usage tracking (for "Most used fields" analytics)
CREATE TABLE field_usage_stats (
    usage_id VARCHAR PRIMARY KEY, -- composite: customer_id:field_path:date
    customer_id VARCHAR NOT NULL,
    field_path VARCHAR NOT NULL,
    field_name VARCHAR NOT NULL,
    parent_type VARCHAR NOT NULL,
    date_bucket DATE NOT NULL,
    
    -- Aggregated metrics
    total_requests INTEGER DEFAULT 0,
    total_latency_ms BIGINT DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Note: FK constraint removed due to DuckDB limitations with composite references
);

-- Indexes for query performance
CREATE INDEX idx_request_logs_customer_timestamp ON request_logs (customer_id, timestamp DESC);
CREATE INDEX idx_request_logs_operation ON request_logs (customer_id, operation_name, timestamp DESC);
CREATE INDEX idx_request_logs_status ON request_logs (customer_id, status_code, timestamp DESC);
CREATE INDEX idx_request_logs_partition ON request_logs (date_partition, customer_id);

CREATE INDEX idx_operation_stats_customer_date ON operation_stats (customer_id, date_bucket DESC);
CREATE INDEX idx_field_usage_customer_date ON field_usage_stats (customer_id, date_bucket DESC);

-- Views for common analytics queries
CREATE VIEW recent_operations AS
SELECT 
    customer_id,
    operation_name,
    operation_type,
    COUNT(*) as total_requests,
    AVG(elapsed_ms) as avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) as p95_latency_ms,
    SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as error_rate_pct
FROM request_logs 
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY customer_id, operation_name, operation_type
ORDER BY total_requests DESC;

CREATE VIEW field_popularity AS
SELECT 
    f.customer_id,
    f.field_path,
    f.field_name,
    f.parent_type,
    f.total_requests,
    CASE 
        WHEN f.total_requests > 0 THEN f.total_latency_ms::FLOAT / f.total_requests
        ELSE 0 
    END as avg_latency_ms,
    CASE 
        WHEN f.total_requests > 0 THEN f.error_count::FLOAT / f.total_requests * 100
        ELSE 0 
    END as error_rate_pct,
    f.last_seen
FROM schema_fields f
WHERE f.total_requests > 0
ORDER BY f.total_requests DESC;

-- Example schema processing queries for the Star Wars schema
/*
-- 1. Insert new schema version
INSERT INTO schema_versions (
    schema_version_id, 
    customer_id, 
    schema_hash, 
    type_count, 
    field_count, 
    operation_count
) VALUES (
    'v1_2025_01_15_abc123', -- nanoid
    'customer_starwars', 
    'hash_of_full_introspection_json',
    12, -- count of non-introspection types
    89, -- total field count across all types
    12  -- count of Query fields (operations)
);

-- 2. Insert schema types (excluding __Schema, __Type, etc.)
INSERT INTO schema_types VALUES
('v1_2025_01_15_abc123:Film', 'Film', 'OBJECT', null, 14, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Person', 'Person', 'OBJECT', null, 16, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Planet', 'Planet', 'OBJECT', null, 14, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Species', 'Species', 'OBJECT', null, 15, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Starship', 'Starship', 'OBJECT', null, 18, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Vehicle', 'Vehicle', 'OBJECT', null, 16, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Query', 'Query', 'OBJECT', null, 12, false, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
-- Built-in scalars
('v1_2025_01_15_abc123:ID', 'ID', 'SCALAR', 'The `ID` scalar type...', 0, true, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:String', 'String', 'SCALAR', 'The `String` scalar type...', 0, true, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Int', 'Int', 'SCALAR', 'The `Int` scalar type...', 0, true, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null),
('v1_2025_01_15_abc123:Boolean', 'Boolean', 'SCALAR', 'The `Boolean` scalar type...', 0, true, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, null);

-- 3. Insert schema fields (sample of key fields)
INSERT INTO schema_fields VALUES
-- Query operations (these are your "operations" in Stellate UI)
('v1_2025_01_15_abc123:Query:allFilms', 'allFilms', 'Query.allFilms', 'Query', '[Film]', true, true, true, 3, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Query:film', 'film', 'Query.film', 'Query', 'Film', false, true, true, 1, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Query:allPeople', 'allPeople', 'Query.allPeople', 'Query', '[Person]', true, true, true, 3, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),

-- Film fields (most requested fields in Stellate UI)
('v1_2025_01_15_abc123:Film:id', 'id', 'Film.id', 'Film', 'ID!', false, false, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Film:title', 'title', 'Film.title', 'Film', 'String', false, true, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Film:characters', 'characters', 'Film.characters', 'Film', '[Person]', true, true, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),

-- Person fields
('v1_2025_01_15_abc123:Person:id', 'id', 'Person.id', 'Person', 'ID!', false, false, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Person:name', 'name', 'Person.name', 'Person', 'String', false, true, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null),
('v1_2025_01_15_abc123:Person:homeworld', 'homeworld', 'Person.homeworld', 'Person', 'Planet', false, true, false, 0, null, null, 'v1_2025_01_15_abc123', 'customer_starwars', CURRENT_TIMESTAMP, 0, 0, 0, null);

-- Query to get Stellate-style analytics after collecting usage data:
-- Operations (12 operations from Query type)
SELECT 
    field_name as operation_name,
    total_requests,
    CASE WHEN total_requests > 0 THEN total_latency_ms / total_requests ELSE 0 END as avg_latency_ms,
    CASE WHEN total_requests > 0 THEN error_count * 100.0 / total_requests ELSE 0 END as error_rate_pct
FROM schema_fields 
WHERE parent_type = 'Query' AND schema_version_id = 'current_active_version'
ORDER BY total_requests DESC;

-- Types (7 main types: Film, Person, Planet, Species, Starship, Vehicle, Query)
SELECT 
    type_name,
    total_requests,
    field_count
FROM schema_types 
WHERE is_builtin = false AND schema_version_id = 'current_active_version'
ORDER BY total_requests DESC;

-- Fields (all fields across all types, most requested)
SELECT 
    field_path,
    total_requests,
    CASE WHEN total_requests > 0 THEN total_latency_ms / total_requests ELSE 0 END as avg_latency_ms,
    CASE WHEN total_requests > 0 THEN error_count * 100.0 / total_requests ELSE 0 END as error_rate_pct
FROM schema_fields 
WHERE schema_version_id = 'current_active_version' AND parent_type != '__Schema'
ORDER BY total_requests DESC;
*/