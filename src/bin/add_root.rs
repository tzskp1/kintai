extern crate diesel;
extern crate kintai;

use diesel::prelude::*;
use diesel::query_dsl::QueryDsl;
use kintai::models::User;

use self::kintai::{create_user, establish_connection};

fn main() {
    let username = "root";
    let password = "pass";
    use kintai::schema::users::dsl::*;
    let connection = establish_connection();
    let conn = connection.unwrap().get().unwrap();
    let user = users
        .filter(id.eq(&username))
        .get_result::<User>(&conn)
        .ok();
    match user {
        None => {
            let u = create_user(&conn, &username, &password, &true).unwrap();
            println!("\nSaved user with id {}", u.id);
        }
        Some(_) => (),
    }
}
