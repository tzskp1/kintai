use actix_files::{Files, NamedFile};
use actix_web::HttpResponse;
use actix_web::{dev::HttpResponseBuilder, get, http::header, http::StatusCode};
use actix_web::{error, web, App, HttpRequest, HttpServer, Responder, Result};
use derive_more::{Display, Error};
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use kintai::{establish_connection, generate_token, login};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::path::PathBuf;

async fn index(req: HttpRequest) -> Result<NamedFile> {
    Ok(NamedFile::open("./build/index.html")?)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserPass {
    pub id: String,
    pub pass: String,
}

#[derive(Debug, Display, Error)]
enum MyError {
    #[display(fmt = "internal error")]
    InternalError,
}

impl error::ResponseError for MyError {
    fn error_response(&self) -> HttpResponse {
        HttpResponseBuilder::new(self.status_code())
            .set_header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(self.to_string())
    }

    fn status_code(&self) -> StatusCode {
        match *self {
            MyError::InternalError => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

async fn login_api(
    user: web::Json<UserPass>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    login(&conn.get().unwrap(), &user.id, &user.pass)
        .ok_or(error::ErrorUnauthorized("unauthorized error"))
        .map(|t| HttpResponse::Ok().json(json!({ "token": t, "token_type": "bearer" })))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    std::env::set_var("RUST_LOG", "actix_web=info");
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number");
    let pool = establish_connection().unwrap();
    HttpServer::new(move || {
        App::new()
            .data(pool.clone())
            .route("/api/login", web::post().to(login_api))
            .route("/", web::get().to(index))
            .service(Files::new("/", "./build").prefer_utf8(true))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
