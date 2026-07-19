use aide::openapi::{Info, OpenApi, Server, Tag};

pub fn base_document() -> OpenApi {
    OpenApi {
        info: Info {
            title: "Friendminton API".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: Some(
                "Backend API for finding badminton players, posting workouts, tracking activity, and joining game invites."
                    .into(),
            ),
            ..Info::default()
        },
        tags: vec![
            Tag {
                name: "auth".into(),
                description: Some("Signup and authentication endpoints".into()),
                ..Tag::default()
            },
            Tag {
                name: "users".into(),
                description: Some("Player profiles and discovery".into()),
                ..Tag::default()
            },
            Tag {
                name: "workouts".into(),
                description: Some("Badminton workout tracking".into()),
                ..Tag::default()
            },
            Tag {
                name: "posts".into(),
                description: Some("Workout posts and feed".into()),
                ..Tag::default()
            },
            Tag {
                name: "game_invites".into(),
                description: Some("Find and join badminton games".into()),
                ..Tag::default()
            },
            Tag {
                name: "engagement".into(),
                description: Some("Weekly summaries and notifications".into()),
                ..Tag::default()
            },
        ],
        servers: vec![Server {
            url: "http://localhost:3000".into(),
            description: Some("Local development".into()),
            ..Server::default()
        }],
        ..OpenApi::default()
    }
}
