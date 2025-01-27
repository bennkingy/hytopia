export function getDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number },
) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
} 