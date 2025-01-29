// Add this after the existing Map declarations at the top
export interface Checkpoint {
	position: { x: number; y: number; z: number };
	radius: number;
	order: number;
}
