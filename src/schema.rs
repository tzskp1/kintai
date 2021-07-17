table! {
    schedules (id) {
        id -> Int8,
        username -> Varchar,
        start_time -> Timestamptz,
        end_time -> Timestamptz,
        permitted -> Bool,
        absent -> Bool,
        enable -> Bool,
        created_by -> Varchar,
    }
}

table! {
    users (id) {
        id -> Varchar,
        pass -> Varchar,
        isadmin -> Bool,
    }
}

allow_tables_to_appear_in_same_query!(schedules, users,);
