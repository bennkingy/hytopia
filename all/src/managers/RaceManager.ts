import { World, PlayerEntity } from "hytopia";
import { ChickenEntity } from "../entities/ChickenEntity";
import type { Checkpoint } from "../types/Checkpoint";
import { getDistance } from "../utils/math";
import { getRandomSpawnCoordinate } from "../utils/spawn";
import { ScoreManager } from "./ScoreManager";

export class RaceManager {
    private checkpoints: Checkpoint[] = [
        { position: { x: 20, y: 1.75, z: 15 }, radius: 5, order: 0 },
        { position: { x: 17, y: 1.75, z: -18 }, radius: 5, order: 1 },
        // { position: { x: -17, y: 1.75, z: -17 }, radius: 5, order: 2 },
        // { position: { x: -12, y: 1.75, z: 20 }, radius: 4, order: 4 },
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
    private chickens: ChickenEntity[] = [];

    constructor(
        private world: World,
        private scoreManager: ScoreManager
    ) {}

    joinRace(playerEntity: PlayerEntity) {
        if (!this.isRaceActive && !this.racers.has(playerEntity.player.id)) {
            this.racers.set(playerEntity.player.id, {
                player: playerEntity,
                checkpointsPassed: 0,
                lastPosition: { ...playerEntity.position },
                startTime: 0,
            });

            this.world.chatManager.sendPlayerMessage(
                playerEntity.player,
                "You joined the race!",
                "00FF00",
            );

            this.world.chatManager.sendBroadcastMessage(
                `${this.racers.size} player${this.racers.size > 1 ? "s" : ""} waiting to race`,
                "FFFF00",
            );
        }
    }

    startRace() {
        if (this.racers.size < 1) return;

        this.isRaceActive = true;

        const basePosition = { ...this.checkpoints[0].position };
        const spread = Math.floor(this.racers.size / 2);
        const positions = Array.from(this.racers.keys()).map((_, index) => ({
            x: basePosition.x + (index - spread) * 2,
            y: basePosition.y,
            z: basePosition.z,
        }));

        // Start countdown sequence
        setTimeout(() => {
            this.racers.forEach((racer) => {
                racer.player.player.ui.sendData({ type: "game-start" });
            });
        }, 0);

        // Teleport and freeze players
        setTimeout(() => {
            Array.from(this.racers.entries()).forEach(([_, racer], index) => {
                racer.player.resetAngularVelocity();
                racer.player.resetLinearVelocity();
                racer.player.setPosition(positions[index]);
                racer.player.setEnabledPositions({ x: false, y: false, z: false });
            });
        }, 500);

        this.spawnChickens();

        // Start race after countdown
        setTimeout(() => {
            const now = Date.now();
            this.racers.forEach((racer) => {
                racer.startTime = now;
                racer.player.setEnabledPositions({ x: true, y: true, z: true });
            });

            this.startProgressUpdates();
            this.startMinimapUpdates();
        }, 3500);
    }

    checkCheckpoints() {
        if (!this.isRaceActive) return;

        this.racers.forEach((racer, playerId) => {
            const nextCheckpoint = this.checkpoints[racer.checkpointsPassed];
            if (!nextCheckpoint) return;

            const distance = getDistance(racer.player.position, nextCheckpoint.position);

            if (distance <= nextCheckpoint.radius) {
                racer.checkpointsPassed++;

                if (racer.checkpointsPassed === this.checkpoints.length) {
                    this.finishRace(racer.player);
                }
            }

            if (racer.player.position.y < -3 || racer.player.position.y > 50) {
                // Optional: Handle falling off map
            }
        });
    }

    private startProgressUpdates() {
        const updateInterval = setInterval(() => {
            if (!this.isRaceActive) {
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

    private startMinimapUpdates() {
        setInterval(() => {
            if (!this.isRaceActive) return;

            const players = Array.from(this.racers.entries()).map(([id, racer]) => ({
                position: racer.player.position,
                isCurrentPlayer: false
            }));

            this.racers.forEach((racer) => {
                const checkpoints = this.checkpoints.map((cp, index) => ({
                    x: cp.position.x,
                    z: cp.position.z,
                    completed: index < racer.checkpointsPassed
                }));

                racer.player.player.ui.sendData({
                    type: 'minimap-update',
                    players: players.map(p => ({
                        ...p,
                        isCurrentPlayer: p.position === racer.player.position
                    })),
                    checkpoints
                });
            });
        }, 100);
    }

    private finishRace(winner: PlayerEntity) {
        if (!this.isRaceActive) return;

        this.isRaceActive = false;

        const winnerData = this.racers.get(winner.player.id);
        if (!winnerData) return;

        const winnerTime = Date.now() - winnerData.startTime;
        this.scoreManager.updateTopScores(winner.player, winnerTime);

        this.racers.forEach((racer) => {
            const playerTime = Date.now() - racer.startTime;
            const isWinner = racer.player.player.id === winner.player.id;

            racer.player.player.ui.sendData({
                type: "race-standings",
                standings: null,
            });

            setTimeout(() => {
                racer.player.player.ui.sendData({
                    type: "game-end",
                    scoreTime: playerTime,
                    lastTopScoreTime: this.scoreManager.getPlayerTopScore(racer.player.player),
                    isWinner: isWinner,
                });

                racer.player.resetAngularVelocity();
                racer.player.resetLinearVelocity();
                racer.player.setRotation({ x: 0, y: 0, z: 0, w: 1 });
                racer.player.setPosition(getRandomSpawnCoordinate());
            }, 100);
        });

        setTimeout(() => {
            this.racers.clear();
        }, 200);

        this.chickens.forEach(chicken => chicken.despawn());
        this.chickens = [];
    }

    getRacerCount(): number {
        return this.racers.size;
    }

    private spawnChickens() {
        this.chickens.forEach(chicken => chicken.despawn());
        this.chickens = [];

        const chickensPerSegment = 2;

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            for (let j = 0; j < chickensPerSegment; j++) {
                const position = this.getRandomPositionBetweenCheckpoints(
                    this.checkpoints[i],
                    this.checkpoints[i + 1]
                );
                const chicken = new ChickenEntity(this.world, position);
                this.chickens.push(chicken);
            }
        }
    }

    private getRandomPositionBetweenCheckpoints(checkpoint1: Checkpoint, checkpoint2: Checkpoint) {
        const t = Math.random();
        const position = {
            x: checkpoint1.position.x + (checkpoint2.position.x - checkpoint1.position.x) * t,
            y: 2,
            z: checkpoint1.position.z + (checkpoint2.position.z - checkpoint1.position.z) * t
        };

        position.x += (Math.random() - 0.5) * 4;
        position.z += (Math.random() - 0.5) * 4;

        return position;
    }
} 