-- Your SQL goes here
CREATE TABLE schedules (
  username VARCHAR NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  permitted BOOLEAN NOT NULL DEFAULT 'f',
  FOREIGN KEY (username) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (end_time > start_time),
  PRIMARY KEY(start_time, end_time)
)
