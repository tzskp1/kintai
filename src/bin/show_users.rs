extern crate diesel;
extern crate kintai;

use self::diesel::prelude::*;
use self::kintai::*;
use self::models::*;

fn main() {
    use kintai::schema::users::dsl::*;

    let connection = establish_connection();
    let results = users
        .limit(5)
        .load::<User>(&connection.unwrap().get().unwrap())
        .expect("Error loading posts");

    println!("Displaying {} users", results.len());
    for u in results {
        println!("{}", u.id);
        println!("----------\n");
        println!("{}", u.pass);
        println!("----------\n");
        println!("{}", u.isadmin);
    }
}
