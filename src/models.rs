#[derive(Queryable)]
pub struct User {
    pub id: String,
    pub pass: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub isadmin: bool,
}

use super::schema::users;

#[derive(Insertable)]
#[table_name = "users"]
pub struct NewUser<'a> {
    pub id: &'a str,
    pub pass: &'a str,
    pub first_name: Option<&'a str>,
    pub last_name: Option<&'a str>,
    pub isadmin: &'a bool,
}

use super::schema::schedules;

use serde::{Deserialize, Serialize};
#[derive(Queryable, Associations, Serialize, Deserialize, Debug)]
#[belongs_to(User, foreign_key = "username")]
pub struct Schedule {
    pub id: i64,
    pub username: String,
    pub start_time: chrono::NaiveDateTime,
    pub end_time: chrono::NaiveDateTime,
    pub permitted: bool,
    pub absent: bool,
    pub enable: bool,
    pub created_by: String,
}
