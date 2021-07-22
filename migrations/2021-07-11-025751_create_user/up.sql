-- Your SQL goes here
CREATE TABLE users (
  id VARCHAR NOT NULL PRIMARY KEY,
  pass VARCHAR NOT NULL,
  first_name VARCHAR,
  last_name VARCHAR,
  isadmin BOOLEAN NOT NULL DEFAULT 'f'
)
