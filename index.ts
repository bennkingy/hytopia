/**
 * HYTOPIA SDK Boilerplate
 *
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 *
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 *
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 *
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 *
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 *
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 *
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

import { startServer, Audio, GameServer, PlayerEntity, Vector3 } from "hytopia";

import worldMap from "./assets/map2.json";

// Add race management types and class
interface Checkpoint {
	position: Vector3;
	radius: number;
	order: number;
}

class RaceManager {
	private checkpoints: Checkpoint[] = [];
	private racers: Map<
		string,
		{ player: PlayerEntity; checkpointsPassed: number }
	> = new Map();
	private isRaceActive: boolean = false;
	private countdown: number = 0;
	private world: GameServer;

	constructor(world: GameServer) {
		this.world = world;

		// Define checkpoints (adjust positions based on your map)
		this.checkpoints = [
			{ position: { x: -22, y: 2, z: -23 }, radius: 5, order: 0 },
			{ position: { x: -20, y: 2, z: 30 }, radius: 5, order: 1 },
			{ position: { x: 22, y: 2, z: 32 }, radius: 5, order: 2 },
			{ position: { x: 29, y: 2, z: -30 }, radius: 5, order: 2 },
		];
	}

	joinRace(playerEntity: PlayerEntity) {
		if (!this.isRaceActive) {
			this.racers.set(playerEntity.player.id, {
				player: playerEntity,
				checkpointsPassed: 0,
			});
			this.world.chatManager.sendPlayerMessage(
				playerEntity.player,
				"You joined the race!",
				"00FF00",
			);
		}
	}

	startRace() {
		if (this.racers.size < 1) {
			return;
		}

		this.isRaceActive = true;
		this.countdown = 3;

		const countdownInterval = setInterval(() => {
			if (this.countdown > 0) {
				this.racers.forEach((racer) => {
					this.world.chatManager.sendPlayerMessage(
						racer.player.player,
						`Race starting in ${this.countdown}...`,
						"FFFF00",
					);
				});
				this.countdown--;
			} else {
				clearInterval(countdownInterval);
				this.racers.forEach((racer) => {
					this.world.chatManager.sendPlayerMessage(
						racer.player.player,
						"GO!",
						"00FF00",
					);
				});

				// Teleport all racers to the first checkpoint
				const startPosition = {
					x: this.checkpoints[0].position.x,
					y: this.checkpoints[0].position.y + 1,
					z: this.checkpoints[0].position.z,
				};

				this.racers.forEach((racer) => {
					racer.player.position = startPosition;
				});
			}
		}, 1000);
	}

	checkCheckpoints() {
		if (!this.isRaceActive) return;

		this.racers.forEach((racer, playerId) => {
			const nextCheckpoint = this.checkpoints[racer.checkpointsPassed];
			if (!nextCheckpoint) return;

			const playerPos = racer.player.position;
			const distance = Math.sqrt(
				Math.pow(playerPos.x - nextCheckpoint.position.x, 2) +
					Math.pow(playerPos.y - nextCheckpoint.position.y, 2) +
					Math.pow(playerPos.z - nextCheckpoint.position.z, 2),
			);

			if (distance <= nextCheckpoint.radius) {
				racer.checkpointsPassed++;
				this.world.chatManager.sendPlayerMessage(
					racer.player.player,
					`Checkpoint ${racer.checkpointsPassed}/${this.checkpoints.length}!`,
					"00FF00",
				);

				console.log(racer.checkpointsPassed, this.checkpoints.length);

				if (racer.checkpointsPassed === this.checkpoints.length) {
					this.finishRace(racer.player);
				}
			}
		});
	}

	private finishRace(winner: PlayerEntity) {
		console.log(winner.player);
		this.isRaceActive = false;
		this.world.chatManager.sendBroadcastMessage(
			`${winner.player.username} won the race!`,
			"FFD700",
		);
		this.racers.clear();
	}
}

/**
 * startServer is alwasys the entry point for our game.
 * It accepts a single function where we should do any
 * setup necessary for our game. The init function is
 * passed a World instance which is the default
 * world created by the game server on startup.
 *
 * Documentation: https://github.com/hytopiagg/sdk/blob/main/docs/server.startserver.md
 */

startServer((world) => {
	/**
	 * Enable debug rendering of the physics simulation.
	 * This will overlay lines in-game representing colliders,
	 * rigid bodies, and raycasts. This is useful for debugging
	 * physics-related issues in a development environment.
	 * Enabling this can cause performance issues, which will
	 * be noticed as dropped frame rates and higher RTT times.
	 * It is intended for development environments only and
	 * debugging physics.
	 */

	// world.simulation.enableDebugRendering(true);

	/**
	 * Load our map.
	 * You can build your own map using https://build.hytopia.com
	 * After building, hit export and drop the .json file in
	 * the assets folder as map.json.
	 */
	world.loadMap(worldMap);

	// Create race manager instance
	const raceManager = new RaceManager(world);

	// Add race check interval
	setInterval(() => {
		raceManager.checkCheckpoints();
	}, 100);

	/**
	 * Handle player joining the game. The onPlayerJoin
	 * function is called when a new player connects to
	 * the game. From here, we create a basic player
	 * entity instance which automatically handles mapping
	 * their inputs to control their in-game entity and
	 * internally uses our player entity controller.
	 */
	world.onPlayerJoin = (player) => {
		const playerEntity = new PlayerEntity({
			player,
			name: "Player",
			modelUri: "models/players/player.gltf",
			modelLoopedAnimations: ["idle"],
			modelScale: 0.5,
		});

		playerEntity.spawn(world, { x: 0, y: 10, z: 0 });

		// Add race commands to welcome messages
		world.chatManager.sendPlayerMessage(
			player,
			"Welcome to the game!",
			"00FF00",
		);
		world.chatManager.sendPlayerMessage(player, "Use WASD to move around.");
		world.chatManager.sendPlayerMessage(player, "Press space to jump.");
		world.chatManager.sendPlayerMessage(player, "Hold shift to sprint.");
		world.chatManager.sendPlayerMessage(
			player,
			"Press \\ to enter or exit debug view.",
		);
		world.chatManager.sendPlayerMessage(player, "Type /join to join the race");
		world.chatManager.sendPlayerMessage(
			player,
			"Type /start to start the race",
		);
	};

	/**
	 * Handle player leaving the game. The onPlayerLeave
	 * function is called when a player leaves the game.
	 * Because HYTOPIA is not opinionated on join and
	 * leave game logic, we are responsible for cleaning
	 * up the player and any entities associated with them
	 * after they leave. We can easily do this by
	 * getting all the known PlayerEntity instances for
	 * the player who left by using our world's EntityManager
	 * instance.
	 */
	world.onPlayerLeave = (player) => {
		world.entityManager
			.getPlayerEntitiesByPlayer(player)
			.forEach((entity) => entity.despawn());
	};

	/**
	 * A silly little easter egg command. When a player types
	 * "/rocket" in the game, they'll get launched into the air!
	 */
	world.chatManager.registerCommand("/rocket", (player) => {
		world.entityManager.getPlayerEntitiesByPlayer(player).forEach((entity) => {
			entity.applyImpulse({ x: 0, y: 20, z: 0 });
		});
	});

	// Add race commands
	world.chatManager.registerCommand("/join", (player) => {
		const playerEntities =
			world.entityManager.getPlayerEntitiesByPlayer(player);
		if (playerEntities.length > 0) {
			raceManager.joinRace(playerEntities[0]);
		}
	});

	world.chatManager.registerCommand("/start", (player) => {
		raceManager.startRace();
	});

	/**
	 * Play some peaceful ambient music to
	 * set the mood!
	 */

	new Audio({
		uri: "audio/music/hytopia-main.mp3",
		loop: true,
		volume: 0.1,
	}).play(world);
});
