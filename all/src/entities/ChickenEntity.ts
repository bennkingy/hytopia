import { Entity, World, ColliderShape, RigidBodyType, PlayerEntity, BlockType } from "hytopia";

export class ChickenEntity extends Entity {
    private isCollected = false;

    constructor(world: World, position: { x: number; y: number; z: number }) {
        super({
            modelUri: 'models/npcs/chicken.gltf',
            modelScale: 1,
            modelLoopedAnimations: ['idle'],
            rigidBodyOptions: {
                type: RigidBodyType.DYNAMIC,
                colliders: [{
                    shape: ColliderShape.BLOCK,
                    halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
                    onCollision: (other: Entity | BlockType, started: boolean) => this.handleCollision(other, started, world)
                }]
            }
        });

        this.spawn(world, position);
        this.setupRandomMovement();
    }

    private handleCollision(other: Entity | BlockType, started: boolean, world: World) {
        if (started && other instanceof PlayerEntity && !this.isCollected) {
            this.isCollected = true;
            this.despawn();
            world.entityManager.getPlayerEntitiesByPlayer(other.player).forEach(entity => {
                entity.applyImpulse({ x: 0, y: 17, z: 0 });
            });
        }
    }

    private setupRandomMovement() {
        this.onTick = (self) => {
            if (Math.random() < 0.02) {
                const randomVelocity = {
                    x: (Math.random() - 0.5) * 2,
                    y: 0,
                    z: (Math.random() - 0.5) * 2
                };
                self.setLinearVelocity(randomVelocity);
            }
        };
    }
} 