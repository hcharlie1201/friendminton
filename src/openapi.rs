use aide::openapi::{Info, OpenApi, Server, Tag};

pub fn base_document(public_base_url: &str, environment: &str) -> OpenApi {
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
                name: "courts".into(),
                description: Some("Badminton court search and community-maintained venue details".into()),
                ..Tag::default()
            },
            Tag {
                name: "gatherings".into(),
                description: Some("Create and join badminton play sessions and socials".into()),
                ..Tag::default()
            },
            Tag {
                name: "groups".into(),
                description: Some("Local badminton communities, membership, and shared goals".into()),
                ..Tag::default()
            },
            Tag {
                name: "places".into(),
                description: Some("Google-backed location autocomplete and place resolution".into()),
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
            url: public_base_url.into(),
            description: Some(format!("{environment} environment")),
            ..Server::default()
        }],
        ..OpenApi::default()
    }
}
