extern crate diesel;
extern crate kintai;

use self::kintai::*;
use std::io::{stdin, Read};

fn main() {
    let connection = establish_connection();

    println!("What would you like your title to be?");
    let mut id = String::new();
    stdin().read_line(&mut id).unwrap();
    let id = &id[..(id.len() - 1)]; // Drop the newline character
    println!("\nOk! Let's write {} (Press {} when finished)\n", id, EOF);
    let mut pass = String::new();
    stdin().read_to_string(&mut pass).unwrap();

    let user = create_user(&connection, id, &pass, &true).unwrap();
    println!("\nSaved user with id {}", user.id);
}

#[cfg(not(windows))]
const EOF: &'static str = "CTRL+D";

#[cfg(windows)]
const EOF: &'static str = "CTRL+Z";
