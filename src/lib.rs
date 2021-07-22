pub mod models;
pub mod schema;
#[macro_use]
extern crate diesel;
extern crate bcrypt;
extern crate dotenv;
extern crate passwords;
extern crate qstring;

use bcrypt::{hash, verify, BcryptError, DEFAULT_COST};
use chrono::Utc;
use derive_more::{Display, Error};
use diesel::prelude::*;
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use dotenv::dotenv;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, TokenData, Validation};
use passwords::PasswordGenerator;
use serde::{Deserialize, Serialize};
use std::env;

use self::models::{NewUser, User};

pub fn establish_connection() -> Option<r2d2::Pool<ConnectionManager<PgConnection>>> {
    let _ = dotenv().ok()?;
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let manager = ConnectionManager::<PgConnection>::new(database_url);
    r2d2::Pool::builder().build(manager).ok()
}

#[derive(Debug, Display, Error)]
pub enum CreateUserError {
    HashError(BcryptError),
    QueryError(diesel::result::Error),
}

#[derive(Debug, Display, Error)]
pub enum UpdatePasswordError {
    HashError(BcryptError),
    QueryError(diesel::result::Error),
    AuthenticationError,
}

pub fn create_user<'a>(
    conn: &PgConnection,
    id: &'a str,
    pass: &'a str,
    isadmin: &'a bool,
    first_name: Option<&'a str>,
    last_name: Option<&'a str>,
) -> Result<User, CreateUserError> {
    use schema::users;
    let hashed = hash(pass, DEFAULT_COST).or_else(|x| Err(CreateUserError::HashError(x)))?;

    let new_user = NewUser {
        id,
        pass: &hashed,
        first_name,
        last_name,
        isadmin,
    };

    diesel::insert_into(users::table)
        .values(&new_user)
        .get_result(conn)
        .or_else(|x| Err(CreateUserError::QueryError(x)))
}

#[derive(Serialize, Deserialize)]
pub struct UserToken {
    // issued at
    pub iat: i64,
    // expiration
    pub exp: i64,
    // data
    pub user: String,
    pub isadmin: bool,
}

pub fn generate_token(username: &str, isadmin: &bool) -> Option<String> {
    let _ = dotenv().ok()?;
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
        isadmin: isadmin.clone(),
    };

    jsonwebtoken::encode(
        &Header::default(),
        &payload,
        &EncodingKey::from_secret(key.as_ref()),
    )
    .ok()
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

pub fn get_user(conn: &PgConnection, username: &str) -> Option<User> {
    use schema::users::dsl::*;
    users.filter(id.eq(username)).get_result::<User>(conn).ok()
}

pub fn login(conn: &PgConnection, username: &str, password: &str) -> Option<String> {
    validate_user(conn, username, password).and_then(|x| generate_token(&x.id, &x.isadmin))
}

pub fn decode(h: &str) -> Option<TokenData<UserToken>> {
    let _ = dotenv().ok()?;
    if h.starts_with("bearer") || h.starts_with("Bearer") {
        let token = h[6..h.len()].trim();
        let key = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        jsonwebtoken::decode::<UserToken>(
            &token,
            &DecodingKey::from_secret(key.as_ref()),
            &Validation::default(),
        )
        .ok()
    } else {
        None
    }
}

pub fn update_password<'a>(
    conn: &PgConnection,
    id: &'a str,
    old: &'a str,
    pass: &'a str,
) -> Result<usize, UpdatePasswordError> {
    use schema::users;
    let _ = validate_user(conn, id, old).ok_or(UpdatePasswordError::AuthenticationError);
    let hashed = hash(pass, DEFAULT_COST).map_err(|x| UpdatePasswordError::HashError(x))?;

    diesel::update(users::table.filter(users::id.eq(id)))
        .set(users::pass.eq(hashed))
        .execute(conn)
        .map_err(|x| UpdatePasswordError::QueryError(x))
}

pub fn create_pg() -> PasswordGenerator {
    PasswordGenerator {
        length: 12,
        numbers: true,
        lowercase_letters: true,
        uppercase_letters: true,
        symbols: true,
        spaces: false,
        exclude_similar_characters: true,
        strict: true,
    }
}
