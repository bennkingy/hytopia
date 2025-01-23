import {
  ColliderShape,
  BlockType,
  Entity,
  GameServer,
  SceneUI,
  startServer,
  Player,
  PlayerEntity,
  RigidBodyType,
  SimpleEntityController,
  World,
  Collider,
} from 'hytopia';

import worldMap from './assets/map.json';

const PLAYER_GAME_START_TIME = new Map<Player, number>(); // Player -> start time of current game
const PLAYER_TOP_SCORES = new Map<Player, number>(); // Player -> highest ever score
let GAME_TOP_SCORES: { name: string, score: number }[] = []; // array user [name, score]

// Add this after the existing Map declarations at the top
interface Checkpoint {
  position: { x: number; y: number; z: number };
  radius: number;
  order: number;
}

class RaceManager {
  private checkpoints: Checkpoint[] = [
    { position: { x: 19, y: 2, z: 20 }, radius: 5, order: 0 },
    { position: { x: 19, y: 2, z: -22 }, radius: 5, order: 1 },
  ];
  
  private racers = new Map<string, { 
    player: PlayerEntity; 
    checkpointsPassed: number;
    lastPosition?: { x: number; y: number; z: number };
  }>();
  
  private isRaceActive = false;
  private countdown = 0;
  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  joinRace(playerEntity: PlayerEntity) {
    // Allow joining if race is not active and player hasn't already joined
    if (!this.isRaceActive && !this.racers.has(playerEntity.player.id)) {
      this.racers.set(playerEntity.player.id, {
        player: playerEntity,
        checkpointsPassed: 0,
        lastPosition: { ...playerEntity.position }
      });
      
      this.world.chatManager.sendPlayerMessage(
        playerEntity.player,
        "You joined the race!",
        "00FF00"
      );

      // Broadcast how many players are waiting
      this.world.chatManager.sendBroadcastMessage(
        `${this.racers.size} player${this.racers.size > 1 ? 's' : ''} waiting to race`,
        "FFFF00"
      );
    }
  }

  startRace() {
    if (this.racers.size < 1) return;

    this.isRaceActive = true;
    
    // Send game-start event to all racers to trigger UI countdown
    this.racers.forEach((racer) => {
      racer.player.player.ui.sendData({ type: 'game-start' });
    });

    // Wait for countdown animation to complete (4 seconds total)
    setTimeout(() => {
      // Teleport all racers to the first checkpoint
      const startPosition = {
        x: this.checkpoints[0].position.x,
        y: this.checkpoints[0].position.y + 1,
        z: this.checkpoints[0].position.z,
      };

      this.racers.forEach((racer) => {
        racer.player.setPosition(startPosition);
        // Store race start time
        PLAYER_GAME_START_TIME.set(racer.player.player, Date.now());
      });
    }, 4000);
  }

  checkCheckpoints() {
    if (!this.isRaceActive) return;

    this.racers.forEach((racer, playerId) => {
      const nextCheckpoint = this.checkpoints[racer.checkpointsPassed];
      if (!nextCheckpoint) return;

      const playerPos = racer.player.position;
      const distance = getDistance(playerPos, nextCheckpoint.position);

      if (distance <= nextCheckpoint.radius) {
        racer.checkpointsPassed++;
        this.world.chatManager.sendPlayerMessage(
          racer.player.player,
          `Checkpoint ${racer.checkpointsPassed}/${this.checkpoints.length}!`,
          "00FF00"
        );

        if (racer.checkpointsPassed === this.checkpoints.length) {
          this.finishRace(racer.player);
        }
      }

      // Update position logging
      if (racer.lastPosition && (
          racer.lastPosition.x !== playerPos.x || 
          racer.lastPosition.y !== playerPos.y || 
          racer.lastPosition.z !== playerPos.z)) {
        console.log(`Position: X: ${Math.round(playerPos.x * 100) / 100}, Y: ${Math.round(playerPos.y * 100) / 100}, Z: ${Math.round(playerPos.z * 100) / 100}`);
        racer.lastPosition = { ...playerPos };
      }
    });
  }

  private finishRace(winner: PlayerEntity) {
    this.isRaceActive = false;
    
    // Calculate race time and update scores
    const startTime = PLAYER_GAME_START_TIME.get(winner.player) ?? Date.now();
    const scoreTime = Date.now() - startTime;
    const lastTopScoreTime = PLAYER_TOP_SCORES.get(winner.player) ?? 0;

    if (!lastTopScoreTime || scoreTime < lastTopScoreTime) {
      PLAYER_TOP_SCORES.set(winner.player, scoreTime);
    }

    // Send game-end events to all racers
    this.racers.forEach((racer) => {
      racer.player.player.ui.sendData({
        type: 'game-end',
        scoreTime,
        lastTopScoreTime,
        isWinner: racer.player === winner // true for winner, false for others
      });
    });

    // Update and broadcast new leaderboard
    updateTopScores();

    // Reset race state
    this.racers.clear();
  }
}

startServer(world => { 
  world.loadMap(worldMap);
  world.onPlayerJoin = player => onPlayerJoin(world, player);
  world.onPlayerLeave = player => onPlayerLeave(world, player);

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
    name: 'Join NPC',
    modelUri: 'models/npcs/mindflayer.gltf',
    modelLoopedAnimations: [ 'idle' ],
    modelScale: 0.5,
    rigidBodyOptions: {
      type: RigidBodyType.FIXED,
      rotation: { x: 0, y: 1, z: 0, w: 0 },
      colliders: [
        Collider.optionsFromModelUri('models/npcs/mindflayer.gltf', 0.5),
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1.5, y: 1, z: 1.5 },
          isSensor: true,
          tag: 'join-race-sensor',
          onCollision: (other: BlockType | Entity, started: boolean) => {
            if (started && other instanceof PlayerEntity) {
              // Join the race
              raceManager.joinRace(other);
              
              // Only start countdown if this is the first player (no existing countdown)
              if (!raceCountdownTimeout) {
                world.chatManager.sendBroadcastMessage(
                  "Race starting in 3 seconds! Touch the NPC to join!",
                  "FFFF00"
                );
                
                raceCountdownTimeout = setTimeout(() => {
                  if (raceManager.racers.size > 0) { // Only start if there are players
                    raceManager.startRace();
                  }
                  raceCountdownTimeout = null;
                }, 3000);
              }
            }
          },
        },
        {
          shape: ColliderShape.CYLINDER,
          radius: 5,
          halfHeight: 2,
          isSensor: true,
          tag: 'rotate-sensor',
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
      (joinNPC.controller! as SimpleEntityController).face(focusedPlayer.position, 2);
    }
  }, 250);

  // Create the Scene UI over the NPC
  const npcMessageUI = new SceneUI({
    templateId: 'join-npc-message',
    attachedToEntity: joinNPC,
    offset: { x: 0, y: 1.75, z: 0 },
  });

  npcMessageUI.load(world);

  joinNPC.spawn(world, { x: 1, y: 3.1, z: 15 });
}

function startGame(playerEntity: PlayerEntity) {
  playerEntity.setPosition(checkpoints[0].position);
  playerEntity.setOpacity(0.3);
  playerEntity.player.ui.sendData({ type: 'game-start' });

  PLAYER_GAME_START_TIME.set(playerEntity.player, Date.now());
  
  setTimeout(() => { // Game starts!
    if (!playerEntity.isSpawned) return;

    playerEntity.setOpacity(1);
  }, 3500);

  // Add checkpoint tracking for the player
  let currentCheckpoint = 0;
  
  playerEntity.onTick = () => {
    // Check if player has fallen off
    if (playerEntity.position.y < -3 || playerEntity.position.y > 10) {
      endGame(playerEntity);wwww
      return;
    }
    
    // Check if player has reached next checkpoint
    const checkpoint = checkpoints[currentCheckpoint];
    const distance = getDistance(playerEntity.position, checkpoint.position);
    
    if (distance <= checkpoint.radius) {
      currentCheckpoint++;
      
      // If player has completed all checkpoints, end the game
      if (currentCheckpoint >= checkpoints.length) {
        endGame(playerEntity);
        return;
      }
      
      // Notify player of checkpoint progress
      playerEntity.player.ui.sendData({ 
        type: 'checkpoint-reached', 
        checkpoint: currentCheckpoint,
        total: checkpoints.length 
      });
    }
    
    // Position logging code...
    if (lastPosition.x !== playerEntity.position.x || 
        lastPosition.y !== playerEntity.position.y || 
        lastPosition.z !== playerEntity.position.z) {
        console.log(`Position: X: ${Math.round(playerEntity.position.x * 100) / 100}, Y: ${Math.round(playerEntity.position.y * 100) / 100}, Z: ${Math.round(playerEntity.position.z * 100) / 100}`);
        lastPosition = { ...playerEntity.position };
    }
  };
}

function endGame(playerEntity: PlayerEntity) {
  const startTime = PLAYER_GAME_START_TIME.get(playerEntity.player) ?? Date.now();
  const scoreTime = Date.now() - startTime;
  const lastTopScoreTime = PLAYER_TOP_SCORES.get(playerEntity.player) ?? 0;

  if (scoreTime > lastTopScoreTime) {
    PLAYER_TOP_SCORES.set(playerEntity.player, scoreTime);
  }

  playerEntity.player.ui.sendData({
    type: 'game-end',
    scoreTime,
    lastTopScoreTime,
  });

  // Reset player to lobby area
  playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
  playerEntity.setPosition(getRandomSpawnCoordinate());

  if (playerEntity.world) {
    updateTopScores();
  }
}

/**
 * Handle players joining the game.
 * We create an initial player entity they control
 * and set up their entity's collision groups to not collider
 * with other players.
 */
function onPlayerJoin(world: World, player: Player) {
  // Load the game UI for the player
  player.ui.load('ui/index.html');
  sendPlayerLeaderboardData(player);

  // Create the player entity
  const playerEntity = new PlayerEntity({
    player,
    name: 'Player',
    modelUri: 'models/players/player.gltf',
    modelLoopedAnimations: [ 'idle' ],
    modelScale: 0.5,
  });

  let lastPosition = { ...playerEntity.position };

  playerEntity.onTick = () => {
    if (playerEntity.position.y < -3 || playerEntity.position.y > 10) {
      // Assume the player has fallen off the map or shot over the wall
      endGame(playerEntity);
    }
    
    // Only log if position has changed
    if (lastPosition.x !== playerEntity.position.x || 
        lastPosition.y !== playerEntity.position.y || 
        lastPosition.z !== playerEntity.position.z) {
        console.log(`Position: X: ${Math.round(playerEntity.position.x * 100) / 100}, Y: ${Math.round(playerEntity.position.y * 100) / 100}, Z: ${Math.round(playerEntity.position.z * 100) / 100}`);
        lastPosition = { ...playerEntity.position };
    }
  };

  // Spawn with a random X coordinate to spread players out a bit.
  playerEntity.spawn(world, getRandomSpawnCoordinate());
}

/**
 * Despawn the player's entity and perform any other
 * cleanup when they leave the game. 
 */
function onPlayerLeave(world: World, player: Player) {
  world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
    endGame(entity); // explicitly end their game if they leave
    entity.despawn(); // despawn their entity
  });
}


function getRandomSpawnCoordinate() {
  const randomX = Math.floor(Math.random() * 15) - 6;

  return { x: randomX, y: 10, z: 22 };
}

function updateTopScores() {
  const topScores = Array.from(PLAYER_TOP_SCORES.entries())
    .sort((a, b) => a[1] - b[1]) // Sort by lowest time first
    .map(([ player, score ]) => ({ player, score }));

  // Get the top 10 fastest times
  const updatedTopScores = topScores.slice(0, 10).map(({ player, score }) => ({ 
    name: player.username, 
    score 
  }));

  // Only update if scores have changed
  const currentScoresStr = JSON.stringify(GAME_TOP_SCORES);
  const updatedScoresStr = JSON.stringify(updatedTopScores);

  if (currentScoresStr !== updatedScoresStr) {
    GAME_TOP_SCORES = updatedTopScores;
    // Broadcast updated leaderboard to all players
    GameServer.instance.playerManager.getConnectedPlayers().forEach(sendPlayerLeaderboardData);
  }
}

function sendPlayerLeaderboardData(player: Player) {
  player.ui.sendData({
    type: 'leaderboard',
    scores: GAME_TOP_SCORES,
  });
}

// Add this helper function at the bottom of the file
function getDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
