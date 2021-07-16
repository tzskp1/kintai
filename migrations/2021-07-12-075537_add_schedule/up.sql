-- Your SQL goes here
CREATE TABLE schedules (
  id BIGSERIAL NOT NULL PRIMARY KEY,
  username VARCHAR NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  permitted BOOLEAN NOT NULL DEFAULT 'f',
  absent BOOLEAN NOT NULL DEFAULT 'f',
  FOREIGN KEY (username) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (end_time > start_time),
  CHECK (permitted OR NOT absent)
)
