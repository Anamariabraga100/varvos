//! Game server with WebSocket broadcast to multiple clients.
//! Uses tokio::sync::broadcast instead of mpsc so each client gets its own receiver.

use tokio::sync::broadcast;
use warp::ws::WebSocket;

#[derive(Debug, Clone, serde::Serialize)]
enum GameMessage {
    PlayerConnected { player_id: u32, username: String },
    PlayerDisconnected { player_id: u32 },
    GameUpdate { data: String },
}

#[derive(Debug)]
struct Game {
    tx: broadcast::Sender<GameMessage>,
}

impl Game {
    fn new(tx: broadcast::Sender<GameMessage>) -> Self {
        Game { tx }
    }
}

async fn websocket_handler(ws: WebSocket, mut game_rx: broadcast::Receiver<GameMessage>) {
    use futures_util::{SinkExt, StreamExt};
    use warp::ws::Message;

    let (mut ws_tx, mut ws_rx) = ws.split();

    // Forward messages from the broadcast channel to the websocket
    tokio::spawn(async move {
        loop {
            match game_rx.recv().await {
                Ok(game_message) => {
                    let json_message = match serde_json::to_string(&game_message) {
                        Ok(json) => json,
                        Err(e) => {
                            eprintln!("Error serializing game message: {:?}", e);
                            continue;
                        }
                    };

                    if let Err(e) = ws_tx.send(Message::text(json_message)).await {
                        eprintln!("Error sending message to websocket: {:?}", e);
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("Receiver lagged, skipped {} messages", n);
                }
                Err(broadcast::error::RecvError::Closed) => {
                    eprintln!("Broadcast channel closed.");
                    break;
                }
            }
        }
    });

    // Handle incoming messages from the websocket (e.g., player input)
    tokio::spawn(async move {
        while let Some(result) = ws_rx.next().await {
            match result {
                Ok(msg) => {
                    if msg.is_text() {
                        println!("Received from client: {:?}", msg.to_str().unwrap_or(""));
                    } else if msg.is_binary() {
                        println!("Received binary message from client.");
                    } else if msg.is_ping() {
                        println!("Received ping from client.");
                    }
                }
                Err(e) => {
                    eprintln!("websocket error: {}", e);
                    break;
                }
            }
        }
    });
}

async fn spawn_game_thread(game_tx: broadcast::Sender<GameMessage>) {
    let game = Game::new(game_tx);

    loop {
        let update_message = GameMessage::GameUpdate {
            data: format!("Game updated at {}", chrono::Utc::now()),
        };
        if let Err(e) = game.tx.send(update_message) {
            eprintln!("Error sending game update (no receivers?): {:?}", e);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        let player_connected_message = GameMessage::PlayerConnected {
            player_id: 1,
            username: "PlayerOne".to_string(),
        };
        if let Err(e) = game.tx.send(player_connected_message) {
            eprintln!("Error sending player connected message: {:?}", e);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // broadcast::channel - Sender is Clone, each client gets its own Receiver via subscribe()
    let (game_tx, _) = broadcast::channel::<GameMessage>(32);

    tokio::spawn(spawn_game_thread(game_tx.clone()));

    // Each WebSocket connection gets its own receiver via subscribe()
    let game_tx = warp::any().map(move || game_tx.clone());

    let routes = warp::path("ws")
        .and(warp::ws())
        .and(game_tx)
        .map(|ws: warp::ws::Ws, tx: broadcast::Sender<GameMessage>| {
            let rx = tx.subscribe(); // Each client gets its own receiver!
            ws.on_upgrade(move |websocket| websocket_handler(websocket, rx))
        });

    println!("Server started at 127.0.0.1:8000");
    warp::serve(routes).run(([127, 0, 0, 1], 8000)).await;

    Ok(())
}
