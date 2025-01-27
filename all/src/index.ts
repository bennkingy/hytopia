import { startServer, World, Player, PlayerEntity } from "hytopia";
import worldMap from "./assets/maps/berahorses.json";
import { JoinNPC } from "./entities/JoinNPC";
import { RaceManager } from "./managers/RaceManager";
import { ScoreManager } from "./managers/ScoreManager";
import { getRandomSpawnCoordinate } from "./utils/spawn";

function onPlayerJoin(world: World, player: Player) {
    player.ui.load("ui/index.html");
    
    const playerEntity = new PlayerEntity({
        player,
        name: "Player",
        modelUri: "models/players/player.gltf",
        modelLoopedAnimations: ["idle"],
        modelScale: 0.5,
    });

    playerEntity.spawn(world, getRandomSpawnCoordinate());
}

function onPlayerLeave(world: World, player: Player) {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
        entity.despawn();
    });
}

startServer((world) => {
    world.loadMap(worldMap);
    world.onPlayerJoin = (player) => onPlayerJoin(world, player);
    world.onPlayerLeave = (player) => onPlayerLeave(world, player);

    const scoreManager = new ScoreManager();
    const raceManager = new RaceManager(world, scoreManager);
    new JoinNPC(world, raceManager);

    // Set up checkpoint checking interval
    const CHECKPOINT_CHECK_INTERVAL = 100; // ms
    const checkpointInterval = setInterval(() => {
        raceManager.checkCheckpoints();
    }, CHECKPOINT_CHECK_INTERVAL);

    // Optional: Clear interval when server stops
    world.stop = () => {
        clearInterval(checkpointInterval);
    };
}); 