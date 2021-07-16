use actix_files::{Files, NamedFile};
use actix_web::HttpResponse;
use actix_web::{dev::HttpResponseBuilder, http::header, http::StatusCode};
use actix_web::{error, web, App, HttpRequest, HttpServer, Responder, Result};
use derive_more::{Display, Error};
use diesel::RunQueryDsl;
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use kintai::models::Schedule;
use kintai::{decode, establish_connection, login, schema};
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

fn auth(req: &HttpRequest) -> Option<String> {
    let t = req.headers().get("Authorization")?.to_str().ok()?;
    let t = decode(t)?;
    Some(t.claims.user)
}

async fn get_schedules(
    req: HttpRequest,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use diesel::QueryDsl;
    use qstring::QString;
    use schema::schedules;
    let qs = QString::from(req.query_string());
    let offset = qs
        .get("offset")
        .unwrap_or_else(|| "0")
        .parse::<i64>()
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse offset: {}", x)))?;
    let limit = qs
        .get("limit")
        .unwrap_or_else(|| "1000")
        .parse::<i64>()
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse limit: {}", x)))?;

    let _ = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            schedules::table
                // .filter(schedules::username.eq(user))
                .order(schedules::start_time.desc())
                .offset(offset)
                .limit(limit)
                .get_results::<Schedule>(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn update_schedule(
    req: HttpRequest,
    web::Path(id): web::Path<i64>,
    se: web::Json<StartEnd>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use diesel::QueryDsl;
    use schema::schedules;

    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            diesel::update(
                schedules::table
                    .filter(schedules::username.eq(user))
                    .filter(schedules::id.eq(id))
                    .filter(schedules::permitted.eq(false)),
            )
            .set((
                schedules::start_time.eq(se.start_time),
                schedules::end_time.eq(se.end_time),
            ))
            .execute(&conn)
            .map_err(|x| error::Error::from(MyError::QueryError(x)))
            .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn add_schedule(
    req: HttpRequest,
    se: web::Json<StartEnd>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use schema::schedules;
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            diesel::insert_into(schedules::table)
                .values((
                    schedules::username.eq(&user),
                    schedules::start_time.eq(&se.start_time),
                    schedules::end_time.eq(&se.end_time),
                    schedules::permitted.eq(&false),
                    schedules::absent.eq(&false),
                ))
                .get_result::<Schedule>(&conn)
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
            .route("/api/login", web::post().to(login_api))
            .service(web::resource("/api/schedules/{id}").route(web::post().to(update_schedule)))
            .route("/api/schedules", web::post().to(add_schedule))
            .route("/api/schedules", web::get().to(get_schedules))
            .route("/", web::get().to(index))
            .service(Files::new("/", "./build").prefer_utf8(true))
            .data(pool.clone())
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
