pub mod models;
pub mod schema;
#[macro_use]
extern crate diesel;
extern crate bcrypt;
extern crate dotenv;

use bcrypt::{hash, verify, BcryptError, DEFAULT_COST};
use chrono::Utc;
use diesel::prelude::*;
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use dotenv::dotenv;
use jsonwebtoken::{EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::env;

use self::models::{NewUser, Schedule, User};

pub fn establish_connection() -> Option<r2d2::Pool<ConnectionManager<PgConnection>>> {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let manager = ConnectionManager::<PgConnection>::new(database_url);
    r2d2::Pool::builder().build(manager).ok()
}

#[derive(Debug)]
pub enum CreateUserError {
    HashError(BcryptError),
    QueryError(diesel::result::Error),
}

pub fn create_user<'a>(
    conn: &PgConnection,
    id: &'a str,
    pass: &'a str,
    isadmin: &'a bool,
) -> Result<User, CreateUserError> {
    use schema::users;
    let hashed = hash(pass, DEFAULT_COST).or_else(|x| Err(CreateUserError::HashError(x)))?;

    let new_user = NewUser {
        id,
        pass: &hashed,
        isadmin,
    };

    diesel::insert_into(users::table)
        .values(&new_user)
        .get_result(conn)
        .or_else(|x| Err(CreateUserError::QueryError(x)))
}

pub fn create_schedule<'a>(
    conn: &PgConnection,
    username: &'a str,
    start_time: &'a chrono::NaiveDateTime,
    end_time: &'a chrono::NaiveDateTime,
    permitted: &'a bool,
) -> Result<Schedule, diesel::result::Error> {
    use schema::schedules;
    let _ = diesel::insert_into(schedules::table)
        .values((
            schedules::username.eq(username),
            schedules::start_time.eq(start_time),
            schedules::end_time.eq(end_time),
            schedules::permitted.eq(permitted),
        ))
        .execute(conn)?;
    Ok(Schedule {
        username: username.to_string(),
        start_time: start_time.clone(),
        end_time: end_time.clone(),
        permitted: permitted.clone(),
    })
}

#[derive(Serialize, Deserialize)]
pub struct UserToken {
    // issued at
    pub iat: i64,
    // expiration
    pub exp: i64,
    // data
    pub user: String,
}

pub fn generate_token(username: &str) -> Result<String, jsonwebtoken::errors::Error> {
    dotenv().ok();
    let key = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let exp = env::var("JWT_EXPIRES_IN")
        .expect("JWT_EXPIRES_IN must be set")
        .parse::<i64>()
        .expect("JWT_EXPIRES_IN must be number");
    let now = Utc::now().timestamp_nanos() / 1_000_000_000; // nanosecond -> second
    let payload = UserToken {
        iat: now,
        exp: now + exp,
        user: username.to_string(),
    };

    jsonwebtoken::encode(
        &Header::default(),
        &payload,
        &EncodingKey::from_secret(key.as_ref()),
    )
}

pub fn validate_user(conn: &PgConnection, username: &str, password: &str) -> Option<User> {
    use schema::users::dsl::*;
    users
        .filter(id.eq(username))
        .get_result::<User>(conn)
        .ok()
        .and_then(|user| {
            if verify(password, &user.pass).ok()? {
                Some(user)
            } else {
                None
            }
        })
}

pub fn login(conn: &PgConnection, username: &str, password: &str) -> Option<String> {
    validate_user(conn, username, password).and_then(|x| generate_token(&x.id).ok())
}
