export function getRandomSpawnCoordinate() {
    const randomX = Math.floor(Math.random() * 15) - 6;
    return { x: randomX, y: 1.75, z: 22 };
} 