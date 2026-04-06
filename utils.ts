import { randomUUID } from "node:crypto";

export function getRandomColor() {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
    return colors[Math.floor(Math.random() * colors.length)];
}

export function getRandomPosition(width: number, height: number, gridSize: number = 40) {
    const cols = Math.floor(width / gridSize);
    const rows = Math.floor(height / gridSize);

    const randomCol = Math.floor(Math.random() * cols);
    const randomRow = Math.floor(Math.random() * rows);

    return {
        x: randomCol * gridSize + gridSize / 2,
        y: randomRow * gridSize + gridSize / 2
    };
}

export function generateUUID(): string {
    return randomUUID();
}