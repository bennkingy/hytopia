import {
	ColliderShape,
	type BlockType,
	Entity,
	GameServer,
	SceneUI,
	startServer,
	type Player,
	PlayerEntity,
	RigidBodyType,
	SimpleEntityController,
	type World,
	Collider,
} from "hytopia";

import worldMap from "./assets/maps/berahorses.json";

const PLAYER_TOP_SCORES = new Map<Player, number>(); // Player -> highest ever score
let GAME_TOP_SCORES: { name: string; score: number }[] = []; // array user [name, score]

// Add this after the existing Map declarations at the top
interface Checkpoint {
	position: { x: number; y: number; z: number };
	radius: number;
	order: number;
}

/**
 * Manages the race and checkpoints.
 *
 * @param world - The world instance.
 */
class RaceManager {
	private checkpoints: Checkpoint[] = [
		{ position: { x: 20, y: 1.75, z: 15 }, radius: 5, order: 0 },
		{ position: { x: 17, y: 1.75, z: -18 }, radius: 5, order: 1 },
		{ position: { x: -17, y: 1.75, z: -17 }, radius: 5, order: 2 },
		// TODO: Add horizontal radius to finish line
		{ position: { x: -12, y: 1.75, z: 20 }, radius: 6, order: 4 },
	];

	private racers = new Map<
		string,
		{
			player: PlayerEntity;
			checkpointsPassed: number;
			lastPosition?: { x: number; y: number; z: number };
			startTime: number;
		}
	>();

	public isRaceActive = false;
	private world: World;

	constructor(world: World) {
		this.world = world;
	}

	joinRace(playerEntity: PlayerEntity) {
		// Only allow joining if race is not active and player hasn't already joined
		if (!this.isRaceActive && !this.racers.has(playerEntity.player.id)) {
			this.racers.set(playerEntity.player.id, {
				player: playerEntity,
				checkpointsPassed: 0,
				lastPosition: { ...playerEntity.position },
				startTime: 0, // Will be set when race starts
			});

			this.world.chatManager.sendPlayerMessage(
				playerEntity.player,
				"You joined the race!",
				"00FF00",
			);

			// Broadcast how many players are waiting
			this.world.chatManager.sendBroadcastMessage(
				`${this.racers.size} player${
					this.racers.size > 1 ? "s" : ""
				} waiting to race`,
				"FFFF00",
			);
		}
	}

	startRace() {
		if (this.racers.size < 1) return;

		this.isRaceActive = true;

		// TODO: Attach a horse entity to each player and use that in the race

		const basePosition = {
			x: this.checkpoints[0].position.x,
			y: this.checkpoints[0].position.y,
			z: this.checkpoints[0].position.z,
		};

		// Spread players along x-axis, 2 units apart
		const spread = Math.floor(this.racers.size / 2);
		const positions = Array.from(this.racers.keys()).map((_, index) => ({
			x: basePosition.x + (index - spread) * 2,
			y: basePosition.y,
			z: basePosition.z,
		}));

		// Start countdown sequence
		setTimeout(() => {
			this.racers.forEach((racer, index) => {
				racer.player.player.ui.sendData({ type: "game-start" });
			});
		}, 0);

		// Teleport at 500ms and freeze players
		setTimeout(() => {
			Array.from(this.racers.entries()).forEach(([_, racer], index) => {
				racer.player.resetAngularVelocity();
				racer.player.resetLinearVelocity(); 
				racer.player.setPosition(positions[index]);
				racer.player.setEnabledPositions({ x: false, y: false, z: false }); // Lock all axes
			});
		}, 500);

		// Start the race after countdown completes (3.5 seconds total)
		setTimeout(() => {
			const now = Date.now();
			this.racers.forEach((racer) => {
				racer.startTime = now;
				racer.player.setEnabledPositions({ x: true, y: true, z: true }); // Unlock all axes to start race
			});

			// Start sending race progress updates
			this.startProgressUpdates();
		}, 3500);
	}

	private startProgressUpdates() {
		const updateInterval = setInterval(() => {
			if (!this.isRaceActive) {
				// Clear standings when race is no longer active
				this.racers.forEach((racer) => {
					racer.player.player.ui.sendData({
						type: "race-standings",
						standings: null,
					});
				});
				clearInterval(updateInterval);
				return;
			}

			const now = Date.now();
			const standings = Array.from(this.racers.entries())
				.map(([_id, racer]) => ({
					name: racer.player.player.username,
					time: now - racer.startTime,
					progress: (racer.checkpointsPassed / this.checkpoints.length) * 100,
				}))
				.sort((a, b) => b.progress - a.progress || a.time - b.time);

			this.racers.forEach((racer) => {
				racer.player.player.ui.sendData({
					type: "race-standings",
					standings,
				});
			});
		}, 1000);
	}

	checkCheckpoints() {
		if (!this.isRaceActive) return;

		this.racers.forEach((racer, _playerId) => {
			const nextCheckpoint = this.checkpoints[racer.checkpointsPassed];
			if (!nextCheckpoint) return;

			const playerPos = racer.player.position;
			const distance = getDistance(playerPos, nextCheckpoint.position);

			// Check if the player is close enough to the next checkpoint
			if (distance <= nextCheckpoint.radius) {
				racer.checkpointsPassed++;
				this.world.chatManager.sendPlayerMessage(
					racer.player.player,
					`Checkpoint ${racer.checkpointsPassed}/${this.checkpoints.length}!`,
					"00FF00",
				);

				// If they've passed all checkpoints, finish the race for them
				if (racer.checkpointsPassed === this.checkpoints.length) {
					if (this.isRaceActive) {
						this.finishRace(racer.player);
					}
				}
			}

			// Optionally, you could check if they fall off the map:
			if (racer.player.position.y < -3 || racer.player.position.y > 50) {
				// For example, you might mark them as DNF or remove them from the race:
				// this.racers.delete(playerId);
				// Or optionally finish the race for them as a DNF. It's up to you.
			}

			// Update position logging
			// if (
			//   racer.lastPosition &&
			//   (racer.lastPosition.x !== playerPos.x ||
			//     racer.lastPosition.y !== playerPos.y ||
			//     racer.lastPosition.z !== playerPos.z)
			// ) {
			//   console.log(
			//     `${racer.player.player.username} - ` +
			//     `Position: X: ${Math.round(playerPos.x * 100) / 100}, ` +
			//     `Y: ${Math.round(playerPos.y * 100) / 100}, ` +
			//     `Z: ${Math.round(playerPos.z * 100) / 100}`
			//   );
			//   racer.lastPosition = { ...playerPos };
			// }
		});
	}

	private finishRace(winner: PlayerEntity) {
		// Guard against multiple calls
		if (!this.isRaceActive) return;

		this.isRaceActive = false;

		const winnerData = this.racers.get(winner.player.id);
		if (!winnerData) return;

		const winnerTime = Date.now() - winnerData.startTime;
		const lastTopScoreTime = PLAYER_TOP_SCORES.get(winner.player) ?? 0;

		// Update winner's top score if they beat their previous best
		if (!lastTopScoreTime || winnerTime < lastTopScoreTime) {
			PLAYER_TOP_SCORES.set(winner.player, winnerTime);
			updateTopScores();
		}

		// Create a Set to track who got their end message
		const messagesSent = new Set<string>();

		// Send game-end events to all racers
		this.racers.forEach((racer) => {
			const playerId = racer.player.player.id;
			if (messagesSent.has(playerId)) return; // skip duplicates
			messagesSent.add(playerId);

			const playerTime = Date.now() - racer.startTime;
			const playerTopScore = PLAYER_TOP_SCORES.get(racer.player.player) ?? 0;
			const isWinner = playerId === winner.player.id;

			// Clear race progress first
			racer.player.player.ui.sendData({
				type: "race-standings",
				standings: null,
			});

			// Small delay to ensure race-standings message is cleared
			setTimeout(() => {
				racer.player.player.ui.sendData({
					type: "game-end",
					scoreTime: playerTime,
					lastTopScoreTime: playerTopScore,
					isWinner: isWinner,
				});

				// Reset player velocity and teleport back to spawn
				racer.player.resetAngularVelocity();
				racer.player.resetLinearVelocity(); 
				racer.player.setRotation({ x: 0, y: 0, z: 0, w: 1 });
				racer.player.setPosition(getRandomSpawnCoordinate());
			}, 100);
		});

		// Reset race state
		setTimeout(() => {
			this.racers.clear();
		}, 200);
	}

	// Add a public method to safely get racer count
	public getRacerCount(): number {
		return this.racers.size;
	}
}

/**
 * Starts the server and initializes the game.
 *
 * @param world - The world instance.
 */
startServer((world) => {
	world.loadMap(worldMap);
	world.onPlayerJoin = (player) => onPlayerJoin(world, player);
	world.onPlayerLeave = (player) => onPlayerLeave(world, player);

	setupJoinNPC(world);
});

/**
 * Creates and sets up the NPC the player can interact
 * with to join the game.
 */
function setupJoinNPC(world: World) {
	let focusedPlayer: PlayerEntity | null = null;
	const raceManager = new RaceManager(world);
	let raceCountdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Set up checkpoint checking interval
	setInterval(() => {
		raceManager.checkCheckpoints();
	}, 100);

	// Create our NPC
	const joinNPC = new Entity({
		controller: new SimpleEntityController(),
		name: "Join NPC",
		modelUri: "models/npcs/mindflayer.gltf",
		modelLoopedAnimations: ["idle"],
		modelScale: 0.5,
		rigidBodyOptions: {
			type: RigidBodyType.FIXED,
			rotation: { x: 0, y: 1, z: 0, w: 0 },
			colliders: [
				Collider.optionsFromModelUri("models/npcs/mindflayer.gltf", 0.5),
				{
					shape: ColliderShape.BLOCK,
					halfExtents: { x: 1.5, y: 1, z: 1.5 },
					isSensor: true,
					tag: "join-race-sensor",
					onCollision: (other: BlockType | Entity, started: boolean) => {
						if (started && other instanceof PlayerEntity) {
							if (raceManager.isRaceActive) {
								world.chatManager.sendPlayerMessage(
									other.player,
									"A race is currently in progress. Please wait for it to finish.",
									"FF0000",
								);
								return;
							}

							// Join the race
							raceManager.joinRace(other);

							// Start countdown if this is the first player
							if (!raceCountdownTimeout) {
								world.chatManager.sendBroadcastMessage(
									`Race starting in 5 seconds! Touch the NPC to join!`,
									"FFFF00",
								);

								raceCountdownTimeout = setTimeout(() => {
									if (raceManager.getRacerCount() > 0) {
										raceManager.startRace();
									}
									raceCountdownTimeout = null;
								}, 5000);
							} else {
								// Inform joining player how much time is left
								world.chatManager.sendPlayerMessage(
									other.player,
									"You joined! Race starting soon...",
									"FFFF00",
								);
							}
						}
					},
				},
				{
					shape: ColliderShape.CYLINDER,
					radius: 5,
					halfHeight: 2,
					isSensor: true,
					tag: "rotate-sensor",
					onCollision: (other: BlockType | Entity, started: boolean) => {
						if (started && other instanceof PlayerEntity) {
							focusedPlayer = other;
						}
					},
				},
			],
		},
	});

	// Rotate to face the last focused player position every 250ms
	setInterval(() => {
		if (focusedPlayer?.isSpawned) {
			(joinNPC.controller! as SimpleEntityController).face(
				focusedPlayer.position,
				2,
			);
		}
	}, 250);

	// Create the Scene UI over the NPC
	const npcMessageUI = new SceneUI({
		templateId: "join-npc-message",
		attachedToEntity: joinNPC,
		offset: { x: 0, y: 1.75, z: 0 },
	});

	npcMessageUI.load(world);

	// Finally, actually spawn the NPC into the world
	joinNPC.spawn(world, { x: 1, y: 2, z: 18 });
}

/**
 * Handle players joining the game.
 * We create an initial player entity they control
 * and set up their entity's collision groups, etc.
 *
 * @param world - The world instance.
 * @param player - The player joining the game.
 */
function onPlayerJoin(world: World, player: Player) {
	// Load the game UI for the player
	player.ui.load("ui/index.html");
	sendPlayerLeaderboardData(player);

	// Create the player entity
	const playerEntity = new PlayerEntity({
		player,
		name: "Player",
		modelUri: "models/players/player.gltf",
		modelLoopedAnimations: ["idle"],
		modelScale: 0.5,
	});

	// Example check for falling off the map (commented out to avoid double "end" events):
	/*
  playerEntity.onTick = () => {
    if (playerEntity.position.y < -3 || playerEntity.position.y > 10) {
      // If you want to remove them from the race or handle DNF here,
      // you can do so by hooking into RaceManager instead.
    }
  };
  */

	// Spawn with a random X coordinate to spread players out.
	playerEntity.spawn(world, getRandomSpawnCoordinate());
}

/**
 * Despawn the player's entity when they leave.
 *
 * @param world - The world instance.
 * @param player - The player leaving the game.
 */
function onPlayerLeave(world: World, player: Player) {
	world.entityManager.getPlayerEntitiesByPlayer(player).forEach((entity) => {
		// No more calls to endGame(entity), just despawn.
		entity.despawn();
	});
}

/**
 * Returns a random spawn point near the top of the map.
 *
 * @returns - The spawn point.
 */
function getRandomSpawnCoordinate() {
	const randomX = Math.floor(Math.random() * 15) - 6;
	return { x: randomX, y: 1.75, z: 22 };
}

/**
 * Recomputes and updates the top scores across all players.
 * Broadcasts the updated leaderboard to all connected clients.
 *
 * @returns - The updated top scores.
 */
function updateTopScores() {
	const topScores = Array.from(PLAYER_TOP_SCORES.entries())
		.sort((a, b) => a[1] - b[1]) // Sort by ascending time
		.map(([player, score]) => ({ player, score }));

	// Get the top 10 fastest times
	const updatedTopScores = topScores.slice(0, 10).map(({ player, score }) => ({
		name: player.username,
		score,
	}));

	// Only update if scores changed
	const currentScoresStr = JSON.stringify(GAME_TOP_SCORES);
	const updatedScoresStr = JSON.stringify(updatedTopScores);

	if (currentScoresStr !== updatedScoresStr) {
		GAME_TOP_SCORES = updatedTopScores;

		// Broadcast to all connected players
		const allPlayers = GameServer.instance.playerManager.getConnectedPlayers();

		allPlayers.forEach((player) => sendPlayerLeaderboardData(player));
	}
}

/**
 * Sends the current leaderboard data to the specified player.
 *
 * @param player - The player to send the leaderboard data to.
 */
function sendPlayerLeaderboardData(player: Player) {
	player.ui.sendData({
		type: "leaderboard",
		scores: GAME_TOP_SCORES,
	});
}

/**
 * Simple distance helper.
 *
 * @param pos1 - The first position.
 * @param pos2 - The second position.
 * @returns - The distance between the two positions.
 */
function getDistance(
	pos1: { x: number; y: number; z: number },
	pos2: { x: number; y: number; z: number },
) {
	const dx = pos1.x - pos2.x;
	const dy = pos1.y - pos2.y;
	const dz = pos1.z - pos2.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
