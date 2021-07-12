use actix_files::{Files, NamedFile};
use actix_web::HttpResponse;
use actix_web::{dev::HttpResponseBuilder, http::header, http::StatusCode};
use actix_web::{error, web, App, HttpRequest, HttpServer, Responder, Result};
use derive_more::{Display, Error};
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use kintai::models::Schedule;
use kintai::{create_schedule, decode, establish_connection, login, schema};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;

async fn index(_: HttpRequest) -> Result<NamedFile> {
    Ok(NamedFile::open("./build/index.html")?)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserPass {
    pub id: String,
    pub pass: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartEnd {
    pub username: String,
    pub start_time: chrono::NaiveDateTime,
    pub end_time: chrono::NaiveDateTime,
}

#[derive(Debug, Display, Error)]
enum MyError {
    #[display(fmt = "internal error")]
    InternalError,
    QueryError(diesel::result::Error),
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
            MyError::QueryError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

async fn login_api(
    user: web::Json<UserPass>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            login(&conn, &user.id, &user.pass)
                .ok_or(error::ErrorUnauthorized("unauthorized error"))
                .map(|t| HttpResponse::Ok().json(json!({ "token": t, "token_type": "bearer" })))
        })
}

fn auth_without_name(req: &HttpRequest) -> Option<String> {
    let t = req.headers().get("Authorization")?.to_str().ok()?;
    let t = decode(t)?;
    Some(t.claims.user)
}

fn auth(req: &HttpRequest, username: &str) -> Option<()> {
    let name = auth_without_name(req)?;
    if name == username {
        Some(())
    } else {
        None
    }
}

async fn get_schedules(
    req: HttpRequest,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use diesel::QueryDsl;
    use diesel::RunQueryDsl;
    use schema::schedules;
    use qstring::QString;
    let qs = QString::from(req.query_string());
    let offset = qs.get("offset").unwrap_or_else(|| "0").parse::<i64>()
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse offset: {}", x)))?;
    let limit = qs.get("limit").unwrap_or_else(|| "1000").parse::<i64>()
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse limit: {}", x)))?;

    let user = auth_without_name(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            schedules::table
                .filter(schedules::username.eq(user))
                .order(schedules::start_time.desc())
                .offset(offset)
                .limit(limit)
                .get_results::<Schedule>(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn add_schedule(
    req: HttpRequest,
    se: web::Json<StartEnd>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    let _ = auth(&req, &se.username).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            create_schedule(&conn, &se.username, &se.start_time, &se.end_time, &false)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
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
            .route("/api/schedules", web::post().to(add_schedule))
            .route("/api/schedules", web::get().to(get_schedules))
            .route("/", web::get().to(index))
            .service(Files::new("/", "./build").prefer_utf8(true))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
