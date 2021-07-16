table! {
    schedules (id) {
        id -> Int8,
        username -> Varchar,
        start_time -> Timestamptz,
        end_time -> Timestamptz,
        permitted -> Bool,
        absent -> Bool,
    }
}

table! {
    users (id) {
        id -> Varchar,
        pass -> Varchar,
        isadmin -> Bool,
    }
}

joinable!(schedules -> users (username));

allow_tables_to_appear_in_same_query!(schedules, users,);
