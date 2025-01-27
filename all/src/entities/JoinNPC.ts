import { Entity, World, SimpleEntityController, RigidBodyType, Collider, ColliderShape, PlayerEntity, SceneUI, BlockType } from "hytopia";
import { RaceManager } from "../managers/RaceManager";

export class JoinNPC extends Entity {
    private focusedPlayer: PlayerEntity | null = null;
    private raceCountdownTimeout: ReturnType<typeof setTimeout> | null = null;
    private npcMessageUI: SceneUI;

    constructor(world: World, raceManager: RaceManager) {
        super({
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
                        onCollision: (other: BlockType | Entity, started: boolean) => this.handleJoinCollision(other, started, world, raceManager)
                    },
                    {
                        shape: ColliderShape.CYLINDER,
                        radius: 5,
                        halfHeight: 2,
                        isSensor: true,
                        tag: "rotate-sensor",
                        onCollision: (other: BlockType | Entity, started: boolean) => this.handleRotateCollision(other, started)
                    }
                ]
            }
        });

        this.npcMessageUI = new SceneUI({
            templateId: "join-npc-message",
            attachedToEntity: this,
            offset: { x: 0, y: 1.75, z: 0 },
        });
        
        this.setupUI(world);
        this.setupRotation();
        this.spawn(world, { x: 1, y: 2, z: 18 });
    }

    private setupUI(world: World) {
        this.npcMessageUI.load(world);
    }

    private setupRotation() {
        setInterval(() => {
            if (this.focusedPlayer?.isSpawned) {
                (this.controller! as SimpleEntityController).face(
                    this.focusedPlayer.position,
                    2,
                );
            }
        }, 250);
    }

    private handleJoinCollision(other: BlockType | Entity, started: boolean, world: World, raceManager: RaceManager) {
        if (started && other instanceof PlayerEntity) {
            if (raceManager.isRaceActive) {
                world.chatManager.sendPlayerMessage(
                    other.player,
                    "A race is currently in progress. Please wait for it to finish.",
                    "FF0000",
                );
                return;
            }

            raceManager.joinRace(other);

            if (!this.raceCountdownTimeout) {
                world.chatManager.sendBroadcastMessage(
                    `Race starting in 5 seconds! Touch the NPC to join!`,
                    "FFFF00",
                );

                this.raceCountdownTimeout = setTimeout(() => {
                    if (raceManager.getRacerCount() > 0) {
                        raceManager.startRace();
                    }
                    this.raceCountdownTimeout = null;
                }, 5000);
            } else {
                world.chatManager.sendPlayerMessage(
                    other.player,
                    "You joined! Race starting soon...",
                    "FFFF00",
                );
            }
        }
    }

    private handleRotateCollision(other: BlockType | Entity, started: boolean) {
        if (started && other instanceof PlayerEntity) {
            this.focusedPlayer = other;
        }
    }
} 