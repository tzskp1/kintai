use actix_files::{Files, NamedFile};
use actix_web::HttpResponse;
use actix_web::{dev::HttpResponseBuilder, http::header, http::StatusCode};
use actix_web::{error, web, App, HttpRequest, HttpServer, Responder, Result};
use chrono::prelude::*;
use chrono::{Duration, NaiveDate};
use derive_more::{Display, Error};
use diesel::connection::{AnsiTransactionManager, TransactionManager};
use diesel::query_dsl::methods::FilterDsl;
use diesel::RunQueryDsl;
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
};
use kintai::models::{Schedule, User};
use kintai::{
    create_user, decode, establish_connection, get_user, login, schema, CreateUserError,
    UpdatePasswordError,
};
use passwords::PasswordGenerator;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
pub struct UserName {
    pub id: String,
    pub isadmin: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Passwords {
    pub new: String,
    pub old: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartEnd {
    pub start_time: chrono::NaiveDateTime,
    pub end_time: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartEndWithUser {
    pub username: String,
    pub start_time: chrono::NaiveDateTime,
    pub end_time: chrono::NaiveDateTime,
}

#[derive(Debug, Display, Error)]
enum MyError {
    #[display(fmt = "internal error")]
    InternalError,
    QueryError(diesel::result::Error),
    CreateUserError(CreateUserError),
    UpdatePasswordError(UpdatePasswordError),
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
            MyError::CreateUserError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            MyError::UpdatePasswordError(_) => StatusCode::INTERNAL_SERVER_ERROR,
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
    use diesel::query_dsl::methods::OrderDsl;
    use diesel::ExpressionMethods;
    use qstring::QString;
    use schema::schedules;

    let _ = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    let qs = QString::from(req.query_string());
    let today = Local::now().naive_local().date();
    let start_date = today
        .checked_sub_signed(Duration::days(
            today.weekday().num_days_from_sunday().into(),
        ))
        .ok_or(error::Error::from(MyError::InternalError))?;
    let end_date = start_date
        .checked_add_signed(Duration::days(7))
        .ok_or(error::Error::from(MyError::InternalError))?;
    let start = qs
        .get("start")
        .map(|x| NaiveDate::parse_from_str(x, "%Y-%m-%d"))
        .unwrap_or_else(|| Ok(start_date))
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse start: {}", x)))?;
    let end = qs
        .get("end")
        .map(|x| NaiveDate::parse_from_str(x, "%Y-%m-%d"))
        .unwrap_or_else(|| Ok(end_date))
        .map_err(|x| error::ErrorBadRequest(format!("cannot parse end: {}", x)))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            schedules::table
                .order(schedules::start_time.desc())
                .filter(schedules::end_time.gt(start.and_hms(0, 0, 0)))
                .filter(schedules::start_time.lt(end.and_hms(0, 0, 0)))
                .get_results::<Schedule>(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn get_users(
    req: HttpRequest,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use schema::users;

    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            let u = get_user(&conn, &user).ok_or(error::Error::from(MyError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                users::table
                    .get_results::<User>(&conn)
                    .map_err(|x| error::Error::from(MyError::QueryError(x)))
                    .map(|x| {
                        HttpResponse::Ok().json(
                            x.iter()
                                .map(|u| json!({"id": u.id, "isadmin": u.isadmin}))
                                .collect::<Value>(),
                        )
                    })
            }
        })
}

async fn add_user(
    req: HttpRequest,
    nu: web::Json<UserName>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
    pg: web::Data<PasswordGenerator>,
) -> Result<HttpResponse, error::Error> {
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            let u = get_user(&conn, &user).ok_or(error::Error::from(MyError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                let np = pg
                    .generate_one()
                    .map_err(|_| error::Error::from(MyError::InternalError))?;
                create_user(&conn, &nu.id, &np, &nu.isadmin)
                    .map_err(|x| error::Error::from(MyError::CreateUserError(x)))
                    .map(|u| {
                        HttpResponse::Ok()
                            .json(json!({"id": u.id, "isadmin": u.isadmin, "pass": np}))
                    })
            }
        })
}

async fn update_password(
    req: HttpRequest,
    p: web::Json<Passwords>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            kintai::update_password(&conn, &user, &p.old, &p.new)
                .map_err(|x| error::Error::from(MyError::UpdatePasswordError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn delete_user(
    req: HttpRequest,
    web::Path(id): web::Path<String>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use schema::users;

    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            let u = get_user(&conn, &user).ok_or(error::Error::from(MyError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                let t = get_user(&conn, &id).ok_or(error::Error::from(MyError::InternalError))?;
                if !t.isadmin || id == user {
                    diesel::delete(users::table.filter(users::id.eq(id)))
                        .execute(&conn)
                        .map_err(|x| error::Error::from(MyError::QueryError(x)))
                        .map(|x| HttpResponse::Ok().json(x))
                } else {
                    Err(error::ErrorForbidden(
                        "can not remove admin account except own",
                    ))
                }
            }
        })
}

async fn update_schedule(
    req: HttpRequest,
    web::Path(id): web::Path<i64>,
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
            diesel::update(
                schedules::table
                    .filter(schedules::created_by.eq(user))
                    .filter(schedules::id.eq(id))
                    .filter(schedules::permitted.eq(false))
                    .filter(schedules::enable.eq(true)),
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
    se: web::Json<StartEndWithUser>,
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
                    schedules::username.eq(&se.username),
                    schedules::created_by.eq(&user),
                    schedules::start_time.eq(&se.start_time),
                    schedules::end_time.eq(&se.end_time),
                    schedules::permitted.eq(&false),
                    schedules::absent.eq(&false),
                    schedules::enable.eq(&true),
                ))
                .get_result::<Schedule>(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn delete_schedule(
    req: HttpRequest,
    web::Path(id): web::Path<i64>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use schema::schedules;
    let ansi = AnsiTransactionManager::new();

    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(MyError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))?;
            let s = schedules::table
                .filter(schedules::id.eq(id))
                .filter(schedules::created_by.eq(user.clone()))
                .get_result::<Schedule>(&conn)
                .map_err(|x| error::Error::from(MyError::QueryError(x)))?;
            if !s.permitted {
                let ret = diesel::delete(schedules::table.filter(schedules::id.eq(id)))
                    .execute(&conn)
                    .map_err(|x| error::Error::from(MyError::QueryError(x)))
                    .map(|x| HttpResponse::Ok().json(x))?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(MyError::QueryError(x)))?;
                return Ok(ret);
            } else {
                let ret = diesel::update(schedules::table.filter(schedules::id.eq(id)))
                    .set(schedules::absent.eq(true))
                    .execute(&conn)
                    .map_err(|x| error::Error::from(MyError::QueryError(x)))
                    .map(|x| HttpResponse::Ok().json(x))?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(MyError::QueryError(x)))?;
                return Ok(ret);
            }
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
    let pg = PasswordGenerator {
        length: 12,
        numbers: true,
        lowercase_letters: true,
        uppercase_letters: true,
        symbols: true,
        spaces: false,
        exclude_similar_characters: true,
        strict: true,
    };
    HttpServer::new(move || {
        App::new()
            .route("/api/login", web::post().to(login_api))
            .service(
                web::resource("/api/schedules/{id}")
                    .route(web::delete().to(delete_schedule))
                    .route(web::patch().to(update_schedule)),
            )
            .route("/api/schedules", web::post().to(add_schedule))
            .route("/api/schedules", web::get().to(get_schedules))
            .route("/api/users", web::post().to(add_user))
            .route("/api/users", web::get().to(get_users))
            .route("/api/users/me/password", web::patch().to(update_password))
            .service(web::resource("/api/users/{id}").route(web::delete().to(delete_user)))
            .route("/", web::get().to(index))
            .service(Files::new("/", "./build").prefer_utf8(true))
            .data(pool.clone())
            .data(pg.clone())
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
