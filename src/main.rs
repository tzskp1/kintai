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
    create_pg, create_user, decode, establish_connection, get_user, login, schema, CreateUserError,
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
enum ServerError {
    #[display(fmt = "internal error")]
    InternalError,
    QueryError(diesel::result::Error),
    CreateUserError(CreateUserError),
    UpdatePasswordError(UpdatePasswordError),
}

impl error::ResponseError for ServerError {
    fn error_response(&self) -> HttpResponse {
        HttpResponseBuilder::new(self.status_code())
            .set_header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(self.to_string())
    }

    fn status_code(&self) -> StatusCode {
        match *self {
            ServerError::InternalError => StatusCode::INTERNAL_SERVER_ERROR,
            ServerError::QueryError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ServerError::CreateUserError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ServerError::UpdatePasswordError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

async fn login_api(
    user: web::Json<UserPass>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
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
        .ok_or(error::Error::from(ServerError::InternalError))?;
    let end_date = start_date
        .checked_add_signed(Duration::days(7))
        .ok_or(error::Error::from(ServerError::InternalError))?;
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            schedules::table
                .order(schedules::start_time.desc())
                .filter(schedules::end_time.gt(start.and_hms(0, 0, 0)))
                .filter(schedules::start_time.lt(end.and_hms(0, 0, 0)))
                .get_results::<Schedule>(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                .map(|x| HttpResponse::Ok().json(x))
        })
}

async fn get_users(
    req: HttpRequest,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use schema::users;

    let ansi = AnsiTransactionManager::new();
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                let ret = users::table
                    .get_results::<User>(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                    .map(|x| {
                        HttpResponse::Ok().json(
                            x.iter()
                                .map(|u| json!({"id": u.id, "isadmin": u.isadmin}))
                                .collect::<Value>(),
                        )
                    })?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
                Ok(ret)
            }
        })
}

async fn add_user(
    req: HttpRequest,
    nu: web::Json<UserName>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
    pg: web::Data<PasswordGenerator>,
) -> Result<HttpResponse, error::Error> {
    let ansi = AnsiTransactionManager::new();
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                let np = pg
                    .generate_one()
                    .map_err(|_| error::Error::from(ServerError::InternalError))?;
                let ret = create_user(&conn, &nu.id, &np, &nu.isadmin)
                    .map_err(|x| error::Error::from(ServerError::CreateUserError(x)))
                    .map(|u| {
                        HttpResponse::Ok()
                            .json(json!({"id": u.id, "isadmin": u.isadmin, "pass": np}))
                    })?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
                Ok(ret)
            }
        })
}

async fn update_password(
    req: HttpRequest,
    p: web::Json<Passwords>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    // -- for demo --
    if user == "root" {
        return Err(error::ErrorForbidden("cannot change password of root"));
    }
    // -- for demo --
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            kintai::update_password(&conn, &user, &p.old, &p.new)
                .map_err(|x| error::Error::from(ServerError::UpdatePasswordError(x)))
                .and_then(|s| {
                    if s == 1 {
                        Ok(HttpResponse::Ok().json("ok"))
                    } else {
                        Err(error::Error::from(ServerError::InternalError))
                    }
                })
        })
}

async fn delete_user(
    req: HttpRequest,
    web::Path(id): web::Path<String>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use schema::users;

    let ansi = AnsiTransactionManager::new();
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    // -- for demo --
    if user == "root" {
        return Err(error::ErrorForbidden("cannot remove root"));
    }
    // -- for demo --
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            if !u.isadmin {
                Err(error::ErrorForbidden("method is allowed for only admin"))
            } else {
                let t =
                    get_user(&conn, &id).ok_or(error::Error::from(ServerError::InternalError))?;
                if !t.isadmin || id == user {
                    let ret = diesel::delete(users::table.filter(users::id.eq(id)))
                        .execute(&conn)
                        .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                        .and_then(|s| {
                            if s == 1 {
                                Ok(HttpResponse::Ok().json("ok"))
                            } else {
                                Err(error::Error::from(ServerError::InternalError))
                            }
                        })?;
                    let _ = ansi
                        .commit_transaction(&conn)
                        .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
                    Ok(ret)
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            diesel::update(
                schedules::table
                    .filter(schedules::created_by.eq(user))
                    .filter(schedules::id.eq(id))
                    .filter(schedules::permitted.eq(false))
                    .filter(schedules::absent.eq(false))
                    .filter(schedules::enable.eq(true)),
            )
            .set((
                schedules::start_time.eq(se.start_time),
                schedules::end_time.eq(se.end_time),
            ))
            .execute(&conn)
            .map_err(|x| error::Error::from(ServerError::QueryError(x)))
            .and_then(|s| {
                if s == 1 {
                    Ok(HttpResponse::Ok().json("ok"))
                } else {
                    Err(error::Error::from(ServerError::InternalError))
                }
            })
        })
}

async fn permit_schedule(
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            let ret = if u.isadmin {
                diesel::update(
                    schedules::table
                        .filter(schedules::username.eq(schedules::created_by))
                        .filter(schedules::id.eq(id))
                        .filter(schedules::permitted.eq(false))
                        .filter(schedules::absent.eq(false))
                        .filter(schedules::enable.eq(true)),
                )
                .set(schedules::permitted.eq(true))
                .execute(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                .and_then(|s| {
                    if s == 1 {
                        Ok(HttpResponse::Ok().json("ok"))
                    } else {
                        Err(error::Error::from(ServerError::InternalError))
                    }
                })
            } else {
                diesel::update(
                    schedules::table
                        .filter(schedules::created_by.ne(user.clone()))
                        .filter(schedules::username.eq(user))
                        .filter(schedules::id.eq(id))
                        .filter(schedules::permitted.eq(false))
                        .filter(schedules::absent.eq(false))
                        .filter(schedules::enable.eq(true)),
                )
                .set(schedules::permitted.eq(true))
                .execute(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                .and_then(|s| {
                    if s == 1 {
                        Ok(HttpResponse::Ok().json("ok"))
                    } else {
                        Err(error::Error::from(ServerError::InternalError))
                    }
                })
            };
            let _ = ansi
                .commit_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            ret
        })
}

async fn absent_schedule(
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            let ret1 = diesel::update(
                schedules::table
                    .filter(schedules::username.eq(user))
                    .filter(schedules::id.eq(id))
                    .filter(schedules::permitted.eq(true))
                    .filter(schedules::absent.eq(false))
                    .filter(schedules::enable.eq(true)),
            )
            .set(schedules::absent.eq(true))
            .execute(&conn)
            .map_err(|x| error::Error::from(ServerError::QueryError(x)))
            .and_then(|s| {
                if s == 1 {
                    Ok(HttpResponse::Ok().json("ok"))
                } else {
                    Err(error::Error::from(ServerError::InternalError))
                }
            });
            let ret2 = if u.isadmin {
                diesel::update(
                    schedules::table
                        .filter(schedules::id.eq(id))
                        .filter(schedules::permitted.eq(true))
                        .filter(schedules::absent.eq(true))
                        .filter(schedules::enable.eq(true)),
                )
                .set(schedules::absent.eq(false))
                .execute(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                .and_then(|s| {
                    if s == 1 {
                        Ok(HttpResponse::Ok().json("ok"))
                    } else {
                        Err(error::Error::from(ServerError::InternalError))
                    }
                })
                // todo: record the fact of rejected.
            } else {
                Err(error::Error::from(ServerError::InternalError))
            };
            let _ = ansi
                .commit_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            ret2.or(ret1)
        })
}

async fn disable_schedule(
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            let ret1 = diesel::update(
                schedules::table
                    .filter(schedules::username.eq(user))
                    .filter(schedules::id.eq(id))
                    .filter(schedules::permitted.eq(false))
                    .filter(schedules::absent.eq(false))
                    .filter(schedules::enable.eq(true)),
            )
            .set(schedules::enable.eq(false))
            .execute(&conn)
            .map_err(|x| error::Error::from(ServerError::QueryError(x)))
            .and_then(|s| {
                if s == 1 {
                    Ok(HttpResponse::Ok().json("ok"))
                } else {
                    Err(error::Error::from(ServerError::InternalError))
                }
            });

            let ret2 = if u.isadmin {
                diesel::update(
                    schedules::table
                        .filter(schedules::id.eq(id))
                        .filter(schedules::permitted.eq(true))
                        .filter(schedules::absent.eq(true))
                        .filter(schedules::enable.eq(true)),
                )
                .set(schedules::enable.eq(false))
                .execute(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                .and_then(|s| {
                    if s == 1 {
                        Ok(HttpResponse::Ok().json("ok"))
                    } else {
                        Err(error::Error::from(ServerError::InternalError))
                    }
                })
            } else {
                Err(error::Error::from(ServerError::InternalError))
            };
            let _ = ansi
                .commit_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            ret2.or(ret1)
        })
}

async fn add_schedule(
    req: HttpRequest,
    se: web::Json<StartEndWithUser>,
    conn: web::Data<r2d2::Pool<ConnectionManager<PgConnection>>>,
) -> Result<HttpResponse, error::Error> {
    use diesel::ExpressionMethods;
    use schema::schedules;

    let ansi = AnsiTransactionManager::new();
    let user = auth(&req).ok_or(error::ErrorUnauthorized("unauthorized error"))?;
    conn.get()
        .ok()
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let u = get_user(&conn, &user).ok_or(error::Error::from(ServerError::InternalError))?;
            if se.username == user || u.isadmin {
                let ret = diesel::insert_into(schedules::table)
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
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                    .map(|x| HttpResponse::Ok().json(x))?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
                Ok(ret)
            } else {
                Err(error::Error::from(ServerError::InternalError))
            }
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
        .ok_or(error::Error::from(ServerError::InternalError))
        .and_then(|conn| {
            let _ = ansi
                .begin_transaction(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            let s = schedules::table
                .filter(schedules::id.eq(id))
                .filter(schedules::created_by.eq(user.clone()))
                .get_result::<Schedule>(&conn)
                .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
            if !s.permitted {
                let ret = diesel::delete(schedules::table.filter(schedules::id.eq(id)))
                    .execute(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))
                    .and_then(|s| {
                        if s == 1 {
                            Ok(HttpResponse::Ok().json("ok"))
                        } else {
                            Err(error::Error::from(ServerError::InternalError))
                        }
                    })?;
                let _ = ansi
                    .commit_transaction(&conn)
                    .map_err(|x| error::Error::from(ServerError::QueryError(x)))?;
                Ok(ret)
            } else {
                Err(error::Error::from(ServerError::InternalError))
            }
        })
}

fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/"))
        .route("/api/login", web::post().to(login_api))
        .service(web::resource("/api/schedules/{id}").route(web::delete().to(delete_schedule)))
        .service(
            web::resource("/api/schedules/{id}/duration").route(web::patch().to(update_schedule)),
        )
        .service(
            web::resource("/api/schedules/{id}/permission").route(web::patch().to(permit_schedule)),
        )
        .service(
            web::resource("/api/schedules/{id}/absence").route(web::patch().to(absent_schedule)),
        )
        .service(
            web::resource("/api/schedules/{id}/availability")
                .route(web::patch().to(disable_schedule)),
        )
        .route("/api/schedules", web::post().to(add_schedule))
        .route("/api/schedules", web::get().to(get_schedules))
        .route("/api/users", web::post().to(add_user))
        .route("/api/users", web::get().to(get_users))
        .route("/api/users/me/password", web::patch().to(update_password))
        .service(web::resource("/api/users/{id}").route(web::delete().to(delete_user)))
        .route("/", web::get().to(index))
        .service(Files::new("/", "./build").prefer_utf8(true));
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    std::env::set_var("RUST_LOG", "actix_web=info");
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number");
    let pool = establish_connection().unwrap();
    let pg = create_pg();
    HttpServer::new(move || {
        App::new()
            .configure(config)
            .data(pool.clone())
            .data(pg.clone())
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test::read_body_json;
    use actix_web::{http::header, http::StatusCode};
    use actix_web::{test, App};
    use chrono::Duration;
    use kintai::establish_connection;
    use serde_json::{json, Value};
    use std::io::Write;
    use uuid::Uuid;

    #[actix_rt::test]
    async fn test_normal_system() {
        let pool = establish_connection().unwrap();
        let pg = create_pg();
        let mut app = test::init_service(
            App::new()
                .configure(config)
                .data(pool.clone())
                .data(pg.clone()),
        )
        .await;

        let resp = test::TestRequest::post()
            .uri("/api/login")
            .header(header::CONTENT_TYPE, "application/json")
            .set_payload(r#"{"id":"root", "pass":"pass"}"#.as_bytes())
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let ts: Value = read_body_json(resp).await;
        let token_root = ts["token"].as_str().unwrap();
        let user_id = Uuid::new_v4();
        let resp = test::TestRequest::post()
            .uri("/api/users")
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&json!({"id": user_id, "isadmin": false }))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let ps: Value = read_body_json(resp).await;
        let test_pass = ps["pass"].as_str().unwrap();
        let resp = test::TestRequest::post()
            .uri("/api/login")
            .header(header::CONTENT_TYPE, "application/json")
            .set_json(&json!({"id": user_id, "pass": test_pass }))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let ts: Value = read_body_json(resp).await;
        let token_test = ts["token"].as_str().unwrap();
        let today = Local::now().naive_local();
        let resp = test::TestRequest::post()
            .uri("/api/schedules")
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .set_json(&StartEndWithUser {
                username: user_id.to_string(),
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(1)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let ps: Value = read_body_json(resp).await;
        let sid = ps["id"].as_i64().unwrap();
        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/permission", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/permission", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/availability", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/availability", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::post()
            .uri("/api/schedules")
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&StartEndWithUser {
                username: user_id.to_string(),
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(1)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let ps: Value = read_body_json(resp).await;
        let sid = ps["id"].as_i64().unwrap();
        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/permission", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/permission", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/duration", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .set_json(&StartEnd {
                start_time: today,
                end_time: today.checked_add_signed(Duration::days(2)).unwrap(),
            })
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/absence", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/availability", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_test))
            .send_request(&mut app)
            .await;

        assert_ne!(resp.status(), StatusCode::OK);

        let resp = test::TestRequest::patch()
            .uri(&format!("/api/schedules/{}/availability", sid))
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("bearer {}", token_root))
            .send_request(&mut app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);
    }
}
