-- creat_usrs_table_locally.sql

-- Connect to Postgres as an admin

DROP DATABASE IF EXISTS localdb;
CREATE DATABASE localdb;

\c localdb;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "Users" (
    user_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20),
    last_name VARCHAR(20),
    first_name VARCHAR(20),
    user_name VARCHAR(20),
    subscription_tier VARCHAR(20),
    university_name VARCHAR(20),
    major VARCHAR(20),
    learning_style JSONB,
    learning_goal TEXT[],
    progress JSONB,
    avatars JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- \d Users