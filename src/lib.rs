pub mod models;
pub mod schema;
#[macro_use]
extern crate diesel;
extern crate bcrypt;
extern crate dotenv;

use bcrypt::{hash, verify, BcryptError, DEFAULT_COST};
use diesel::pg::PgConnection;
use diesel::prelude::*;
use dotenv::dotenv;
use std::env;

pub fn establish_connection() -> PgConnection {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url).expect(&format!("Error connecting to {}", database_url))
}

use self::models::{NewUser, User};

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
        id: id,
        pass: &hashed,
        isadmin: isadmin,
    };

    diesel::insert_into(users::table)
        .values(&new_user)
        .get_result(conn)
        .or_else(|x| Err(CreateUserError::QueryError(x)))
}
