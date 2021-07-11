#[derive(Queryable)]
pub struct User {
    pub id: String,
    pub pass: String,
    pub isadmin: bool,
}

use super::schema::users;

#[derive(Insertable)]
#[table_name = "users"]
pub struct NewUser<'a> {
    pub id: &'a str,
    pub pass: &'a str,
    pub isadmin: &'a bool,
}
