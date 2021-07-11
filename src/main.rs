use actix_files::{Files, NamedFile};
use actix_web::{get, web, App, HttpRequest, HttpServer, Responder, Result};
use std::env;
use std::path::PathBuf;

async fn index(req: HttpRequest) -> Result<NamedFile> {
    Ok(NamedFile::open("./build/index.html")?)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    std::env::set_var("RUST_LOG", "actix_web=info");
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number");
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(index))
            .service(Files::new("/", "./build").prefer_utf8(true))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
