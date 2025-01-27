import { Player } from "hytopia";

export class ScoreManager {
    private playerTopScores = new Map<Player, number>();
    private gameTopScores: { name: string; score: number }[] = [];

    updateTopScores(player: Player, newScore: number) {
        const lastTopScore = this.playerTopScores.get(player);
        if (!lastTopScore || newScore < lastTopScore) {
            this.playerTopScores.set(player, newScore);
            this.recalculateGameTopScores();
        }
    }

    private recalculateGameTopScores() {
        const topScores = Array.from(this.playerTopScores.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, 10)
            .map(([player, score]) => ({
                name: player.username,
                score,
            }));

        if (JSON.stringify(this.gameTopScores) !== JSON.stringify(topScores)) {
            this.gameTopScores = topScores;
            this.broadcastScores();
        }
    }

    private broadcastScores() {
        // TODO: Implementation of broadcasting scores to all players
    }

    getGameTopScores() {
        return this.gameTopScores;
    }

    getPlayerTopScore(player: Player): number {
        return this.playerTopScores.get(player) ?? 0;
    }
} 