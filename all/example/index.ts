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

  // Create our NPC
  const joinNPC = new Entity({
    controller: new SimpleEntityController(),
    name: 'Join NPC',
    modelUri: 'models/npcs/mindflayer.gltf',
    modelLoopedAnimations: [ 'idle' ],
    modelScale: 0.5,
    rigidBodyOptions: {
      type: RigidBodyType.FIXED, // It won't ever move, so we can use a fixed body
      rotation: { x: 0, y: 1, z: 0, w: 0 }, // Rotate the NPC to face the player
      colliders: [
        Collider.optionsFromModelUri('models/npcs/mindflayer.gltf', 0.5), // Uses the model's bounding box to create the hitbox collider
        { // Create a sensor that teleports the player into the game
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1.5, y: 1, z: 1.5 }, // size it slightly smaller than the platform the join NPC is standing on
          isSensor: true,
          tag: 'teleport-sensor',
          onCollision: (other: BlockType | Entity, started: boolean) => {
            if (started && other instanceof PlayerEntity) {
              startGame(other); // When a player entity enters this sensor, start the game for them
            }
          },
        },
        { // Create a sensor to detect players for a fun rotation effect
          shape: ColliderShape.CYLINDER,
          radius: 5,
          halfHeight: 2,
          isSensor: true, // This makes the collider not collide with other entities/objets
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
  playerEntity.setPosition({ x: 1, y: 4, z: 1 });
  playerEntity.setOpacity(0.3);
  playerEntity.player.ui.sendData({ type: 'game-start' });
  enablePlayerEntityGameCollisions(playerEntity, false);

  PLAYER_GAME_START_TIME.set(playerEntity.player, Date.now());
  
  setTimeout(() => { // Game starts!
    if (!playerEntity.isSpawned) return;

    playerEntity.setOpacity(1);
    enablePlayerEntityGameCollisions(playerEntity, true);
  }, 3500);
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
    .sort((a, b) => b[1] - a[1])
    .map(([ player, score ]) => ({ player, score }));

  // Get the top 10 highest scores
  const updatedTopScores = topScores.slice(0, 10).map(({ player, score }) => ({ name: player.username, score }));

  // Convert both arrays to strings for comparison
  const currentScoresStr = JSON.stringify(GAME_TOP_SCORES);
  const updatedScoresStr = JSON.stringify(updatedTopScores);

  // Only update if scores have changed
  if (currentScoresStr !== updatedScoresStr) {
    GAME_TOP_SCORES = updatedTopScores;
  }

  GameServer.instance.playerManager.getConnectedPlayers().forEach(sendPlayerLeaderboardData);
}

function sendPlayerLeaderboardData(player: Player) {
  player.ui.sendData({
    type: 'leaderboard',
    scores: GAME_TOP_SCORES,
  });
}
